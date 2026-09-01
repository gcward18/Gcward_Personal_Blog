import json
import os

import boto3


bedrock = boto3.client("bedrock-runtime")
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-lite-v1:0")


def response(status_code, body, origin):
    allowed_origins = os.environ["ALLOWED_ORIGINS"].split(",")
    response_origin = origin if origin in allowed_origins else allowed_origins[0]
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": response_origin,
        },
        "body": json.dumps(body),
    }


def extract_json(text):
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end < start:
        raise ValueError("The model did not return structured output.")
    return json.loads(cleaned[start:end + 1])


def handler(event, _context):
    headers = event.get("headers") or {}
    origin = headers.get("origin") or headers.get("Origin")
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    groups = set(claims.get("cognito:groups", "").split(","))
    premium_groups = set(os.environ.get("PREMIUM_GROUPS", "Authors").split(","))
    if groups.isdisjoint(premium_groups):
        return response(403, {"error": "Premium author access is required."}, origin)

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "The request body must be valid JSON."}, origin)

    instruction = str(body.get("instruction", "")).strip()
    article = str(body.get("article", ""))
    history = body.get("messages", [])
    if not instruction:
        return response(400, {"error": "An instruction or question is required."}, origin)
    if len(instruction) > 4_000 or len(article) > 100_000:
        return response(400, {"error": "The assistant request exceeds an allowed limit."}, origin)

    recent_history = []
    for item in history[-8:]:
        role = item.get("role")
        content = str(item.get("content", ""))[:4_000]
        if role in ("user", "assistant") and content:
            if recent_history and recent_history[-1]["role"] == role:
                recent_history[-1]["content"][0]["text"] += f"\n\n{content}"
            else:
                recent_history.append({"role": role, "content": [{"text": content}]})

    prompt = f"""Current article Markdown:
<article>
{article}
</article>

Author request:
{instruction}

Return only a JSON object with this exact shape:
{{"feedback":"concise explanation or editorial feedback","markdown":"the complete revised article in Markdown","changed":true}}

If the author only asks a question or requests feedback without asking for edits, preserve the article exactly in markdown and set changed to false. The markdown value must always contain the complete article, never a patch, and must not include Markdown code fences around the whole article."""

    try:
        result = bedrock.converse(
            modelId=MODEL_ID,
            system=[{"text": (
                "You are the premium editorial assistant for The Curious Developer. "
                "Help authors plan, critique, and revise technical articles. Preserve factual claims "
                "unless asked to change them, never invent sources, and always produce valid Markdown."
            )}],
            messages=(
                recent_history[:-1] + [{
                    "role": "user",
                    "content": [{"text": f'{recent_history[-1]["content"][0]["text"]}\n\n{prompt}'}],
                }]
                if recent_history and recent_history[-1]["role"] == "user"
                else recent_history + [{"role": "user", "content": [{"text": prompt}]}]
            ),
            inferenceConfig={"maxTokens": 10_000, "temperature": 0.2, "topP": 0.9},
        )
        output_text = "".join(
            block.get("text", "")
            for block in result["output"]["message"]["content"]
            if "text" in block
        )
        assistant_result = extract_json(output_text)
        markdown = str(assistant_result.get("markdown", article))
        feedback = str(assistant_result.get("feedback", "Revision ready."))
        changed = bool(assistant_result.get("changed")) and markdown != article
        return response(200, {
            "status": "success",
            "feedback": feedback,
            "markdown": markdown,
            "changed": changed,
        }, origin)
    except Exception as error:
        print(f"Bedrock assistant error: {error}")
        return response(502, {
            "error": "The writing assistant could not complete this request. Try again shortly."
        }, origin)
