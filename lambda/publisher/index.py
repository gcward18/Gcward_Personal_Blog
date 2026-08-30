import base64
import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone

import boto3


secrets = boto3.client("secretsmanager")
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


def github_request(method, path, token, payload=None):
    request = urllib.request.Request(
        f"https://api.github.com{path}",
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "curious-developer-publisher",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as github_response:
            return json.loads(github_response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8")
        raise RuntimeError(f"GitHub API returned {error.code}: {detail}") from error


def handler(event, _context):
    headers = event.get("headers") or {}
    origin = headers.get("origin") or headers.get("Origin")
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    groups = claims.get("cognito:groups", "").split(",")
    if "Authors" not in groups:
        return response(403, {"error": "Author membership is required."}, origin)

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "The request body must be valid JSON."}, origin)

    title = str(body.get("title", "")).strip()
    slug = str(body.get("slug", "")).strip().lower()
    snippet = str(body.get("snippet", "")).strip()
    content = str(body.get("content", "")).strip()
    tags = [str(tag).strip() for tag in body.get("tags", []) if str(tag).strip()]

    if not title or not snippet or not content or not SLUG_PATTERN.fullmatch(slug):
        return response(400, {"error": "Title, valid slug, summary, and content are required."}, origin)
    if len(title) > 140 or len(snippet) > 400 or len(content) > 100_000 or len(tags) > 10:
        return response(400, {"error": "The draft exceeds an allowed field limit."}, origin)

    owner = os.environ["GITHUB_OWNER"]
    repository = os.environ["GITHUB_REPOSITORY"]
    base_branch = os.environ.get("GITHUB_BASE_BRANCH", "main")
    repo_path = f"/repos/{owner}/{repository}"
    document_path = f"frontend/src/content/{slug}.json"

    try:
        token = secrets.get_secret_value(
            SecretId=os.environ["GITHUB_TOKEN_SECRET"]
        )["SecretString"]
        base_ref = github_request("GET", f"{repo_path}/git/ref/heads/{base_branch}", token)
        branch = f"article/{slug}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        github_request(
            "POST",
            f"{repo_path}/git/refs",
            token,
            {"ref": f"refs/heads/{branch}", "sha": base_ref["object"]["sha"]},
        )

        article = {
            "id": slug,
            "title": title,
            "snippet": snippet,
            "tags": tags,
            "date": datetime.now(timezone.utc).strftime("%Y-%m"),
            "category": "COMMUNITY",
            "content": content,
        }
        encoded_content = base64.b64encode(
            (json.dumps(article, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
        ).decode("ascii")
        github_request(
            "PUT",
            f"{repo_path}/contents/{document_path}",
            token,
            {
                "message": f"content: add {title}",
                "content": encoded_content,
                "branch": branch,
            },
        )

        author = claims.get("email") or claims.get("cognito:username") or "Cognito author"
        pull_request = github_request(
            "POST",
            f"{repo_path}/pulls",
            token,
            {
                "title": f"Article: {title}",
                "head": branch,
                "base": base_branch,
                "body": (
                    f"## Curious Developer article review\n\n"
                    f"Submitted by: {author}\n\n"
                    f"Document: `{document_path}`\n\n"
                    "Review the technical accuracy, links, formatting, and scope before merging."
                ),
            },
        )
    except Exception as error:
        print(str(error))
        return response(
            502,
            {
                "error": (
                    "The publishing service could not create the GitHub review request. "
                    "Verify the GitHub token secret and repository permissions."
                )
            },
            origin,
        )

    return response(
        201,
        {
            "status": "pending_review",
            "pullRequestUrl": pull_request["html_url"],
            "pullRequestNumber": pull_request["number"],
        },
        origin,
    )
