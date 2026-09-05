import json
import os
import random
import re

import boto3


bedrock = boto3.client("bedrock-runtime")
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-lite-v1:0")
IMAGE_MODEL_ID = os.environ.get("BEDROCK_IMAGE_MODEL_ID", "amazon.nova-canvas-v1:0")
SITE_URL = os.environ.get("SITE_URL", "https://thecuriousengineerblog.dev").rstrip("/")
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


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
    mode = body.get("mode", "article")
    article_meta = body.get("articleMeta") or {}
    if not isinstance(article_meta, dict):
        article_meta = {}
    if not instruction:
        return response(400, {"error": "An instruction or question is required."}, origin)
    if len(instruction) > 4_000 or len(article) > 100_000:
        return response(400, {"error": "The assistant request exceeds an allowed limit."}, origin)
    if mode not in ("article", "linkedin", "linkedin_image"):
        return response(400, {"error": "Unsupported assistant mode."}, origin)

    recent_history = []
    for item in history[-8:]:
        role = item.get("role")
        content = str(item.get("content", ""))[:4_000]
        if role in ("user", "assistant") and content:
            if recent_history and recent_history[-1]["role"] == role:
                recent_history[-1]["content"][0]["text"] += f"\n\n{content}"
            else:
                recent_history.append({"role": role, "content": [{"text": content}]})

    if mode in ("linkedin", "linkedin_image"):
        slug = str(article_meta.get("slug", "")).strip().lower()
        if not SLUG_PATTERN.fullmatch(slug):
            return response(400, {"error": "Add a valid article slug before generating a LinkedIn post."}, origin)
        title = str(article_meta.get("title", "")).strip()[:140]
        snippet = str(article_meta.get("snippet", "")).strip()[:400]
        raw_tags = article_meta.get("tags", [])
        if not isinstance(raw_tags, list):
            raw_tags = []
        tags = [str(tag).strip()[:50] for tag in raw_tags[:10]]
        article_url = f"{SITE_URL}/pages/{slug}/"
        if mode == "linkedin_image":
            image_prompt = (
                "Editorial image for a LinkedIn article post. "
                f"Article title: {title}. Article summary: {snippet}. "
                f"Creative direction: {instruction}. "
                "Professional, visually clear, strong central concept, landscape composition."
            )[:1024]
            try:
                image_response = bedrock.invoke_model(
                    modelId=IMAGE_MODEL_ID,
                    contentType="application/json",
                    accept="application/json",
                    body=json.dumps({
                        "taskType": "TEXT_IMAGE",
                        "textToImageParams": {
                            "text": image_prompt,
                            "negativeText": "words, letters, logos, watermarks, signatures, distorted objects, low resolution",
                            "style": "FLAT_VECTOR_ILLUSTRATION",
                        },
                        "imageGenerationConfig": {
                            "numberOfImages": 1,
                            "quality": "standard",
                            "width": 1200,
                            "height": 624,
                            "cfgScale": 7.0,
                            "seed": random.randint(0, 858_993_459),
                        },
                    }),
                )
                image_result = json.loads(image_response["body"].read())
                images = image_result.get("images", [])
                if not images:
                    raise ValueError("Nova Canvas returned no image.")
                return response(200, {
                    "status": "success",
                    "feedback": "A LinkedIn image draft is ready for review.",
                    "imageBase64": images[0],
                    "contentType": "image/png",
                    "filename": f"{slug}-linkedin.png",
                    "changed": False,
                }, origin)
            except Exception as error:
                print(f"Bedrock image generation error: {type(error).__name__}")
                return response(502, {
                    "error": "The image generator could not complete this request. Try again shortly."
                }, origin)

        prompt = f"""Create a LinkedIn post for this article.

Title: {title}
Summary: {snippet}
Tags: {', '.join(tags)}
Article URL: {article_url}
Article Markdown:
<article>
{article}
</article>

Author request:
{instruction}

Return only a JSON object with this exact shape:
{{"feedback":"one concise sentence about the draft","socialPost":"complete LinkedIn post"}}

The post must be no more than 2,800 characters, use the exact Article URL once, accurately reflect the article, contain no unsupported claims, and include no more than five relevant hashtags. Do not wrap the post in quotation marks or a Markdown code fence."""
    else:
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
        if mode == "linkedin":
            social_post = str(assistant_result.get("socialPost", "")).strip()
            if not social_post or len(social_post) > 3_000:
                raise ValueError("The generated LinkedIn post was empty or too long.")
            if social_post.count(article_url) != 1:
                raise ValueError("The generated LinkedIn post did not contain the required article URL exactly once.")
            return response(200, {
                "status": "success",
                "feedback": str(assistant_result.get("feedback", "LinkedIn draft ready.")),
                "socialPost": social_post,
                "changed": False,
            }, origin)

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
