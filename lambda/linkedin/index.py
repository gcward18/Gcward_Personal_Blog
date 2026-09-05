import base64
import json
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

import boto3


ddb = boto3.resource("dynamodb").Table(os.environ["LINKEDIN_TABLE"])
secrets_client = boto3.client("secretsmanager")
CLIENT_ID = os.environ["LINKEDIN_CLIENT_ID"]
CLIENT_SECRET_NAME = os.environ["LINKEDIN_CLIENT_SECRET"]
REDIRECT_URI = os.environ["LINKEDIN_REDIRECT_URI"]
LINKEDIN_VERSION = os.environ.get("LINKEDIN_VERSION", "202608")
ORGANIZATION_ID = os.environ.get("LINKEDIN_ORGANIZATION_ID", "")
ORGANIZATION_NAME = os.environ.get("LINKEDIN_ORGANIZATION_NAME", "LinkedIn company page")
SCOPES = "openid profile w_organization_social"


def response(status, body, origin):
    return {
        "statusCode": status,
        "headers": {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Headers": "Authorization,Content-Type",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body),
    }


def request_json(method, url, token=None, body=None, form=None):
    headers = {"Accept": "application/json"}
    data = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if form is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        data = urllib.parse.urlencode(form).encode()
    elif body is not None:
        headers.update({
            "Content-Type": "application/json",
            "LinkedIn-Version": LINKEDIN_VERSION,
            "X-Restli-Protocol-Version": "2.0.0",
        })
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=25) as result:
            payload = result.read()
            return json.loads(payload) if payload else {}, dict(result.headers)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"LinkedIn returned HTTP {error.code}: {detail}") from error


def client_secret():
    value = secrets_client.get_secret_value(SecretId=CLIENT_SECRET_NAME)["SecretString"].strip()
    try:
        parsed = json.loads(value)
        return parsed.get("client_secret") or parsed.get("secret") or value
    except json.JSONDecodeError:
        return value


def put_image(upload_url, image_bytes, content_type, access_token):
    req = urllib.request.Request(
        upload_url,
        data=image_bytes,
        headers={"Content-Type": content_type, "Authorization": f"Bearer {access_token}"},
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=45) as result:
        if result.status not in (200, 201):
            raise RuntimeError("LinkedIn rejected the image upload.")


def handler(event, _context):
    origin = event.get("headers", {}).get("origin", "")
    allowed = os.environ.get("ALLOWED_ORIGINS", "").split(",")
    origin = origin if origin in allowed else allowed[0]
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    groups = claims.get("cognito:groups", "")
    if isinstance(groups, str):
        groups = [item.strip() for item in groups.strip("[]").split(",") if item.strip()]
    if not set(groups).intersection(os.environ.get("PREMIUM_GROUPS", "Authors").split(",")):
        return response(403, {"error": "Premium author access is required."}, origin)
    subject = claims.get("sub")
    if not subject:
        return response(401, {"error": "Author identity is unavailable."}, origin)

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "Request body must be valid JSON."}, origin)
    action = body.get("action")
    now = int(time.time())

    try:
        if action == "authorize":
            state = secrets.token_urlsafe(32)
            ddb.put_item(Item={
                "pk": f"state#{state}", "subject": subject,
                "expiresAt": now + 600, "ttl": now + 600,
            })
            query = urllib.parse.urlencode({
                "response_type": "code", "client_id": CLIENT_ID,
                "redirect_uri": REDIRECT_URI, "state": state, "scope": SCOPES,
            })
            return response(200, {"authorizeUrl": f"https://www.linkedin.com/oauth/v2/authorization?{query}"}, origin)

        if action == "callback":
            state = str(body.get("state", ""))
            code = str(body.get("code", ""))
            state_key = {"pk": f"state#{state}"}
            saved = ddb.get_item(Key=state_key, ConsistentRead=True).get("Item")
            if not saved or saved.get("subject") != subject or int(saved.get("expiresAt", 0)) < now:
                return response(400, {"error": "The LinkedIn authorization state is invalid or expired."}, origin)
            ddb.delete_item(Key=state_key)
            token_result, _ = request_json("POST", "https://www.linkedin.com/oauth/v2/accessToken", form={
                "grant_type": "authorization_code", "code": code,
                "client_id": CLIENT_ID, "client_secret": client_secret(),
                "redirect_uri": REDIRECT_URI,
            })
            access_token = token_result["access_token"]
            profile, _ = request_json("GET", "https://api.linkedin.com/v2/userinfo", token=access_token)
            expires_at = now + int(token_result.get("expires_in", 3600))
            ddb.put_item(Item={
                "pk": f"member#{subject}", "accessToken": access_token,
                "memberId": profile["sub"], "displayName": profile.get("name", "LinkedIn member"),
                "expiresAt": expires_at, "ttl": expires_at,
            })
            return response(200, {
                "connected": True,
                "displayName": profile.get("name", "LinkedIn member"),
                "organizationName": ORGANIZATION_NAME,
            }, origin)

        member = ddb.get_item(Key={"pk": f"member#{subject}"}, ConsistentRead=True).get("Item")
        if action == "status":
            connected = bool(member and int(member.get("expiresAt", 0)) > now)
            return response(200, {
                "connected": connected,
                "displayName": member.get("displayName") if connected else None,
                "organizationName": ORGANIZATION_NAME if connected else None,
            }, origin)
        if action == "disconnect":
            ddb.delete_item(Key={"pk": f"member#{subject}"})
            return response(200, {"connected": False}, origin)
        if action != "publish":
            return response(400, {"error": "Unsupported LinkedIn action."}, origin)
        if not member or int(member.get("expiresAt", 0)) <= now:
            return response(401, {"error": "Connect LinkedIn again before publishing."}, origin)

        commentary = str(body.get("commentary", "")).strip()
        if not commentary or len(commentary) > 3000:
            return response(400, {"error": "The LinkedIn post must contain 1–3,000 characters."}, origin)
        if not ORGANIZATION_ID.isdigit():
            return response(503, {"error": "The LinkedIn company page ID is not configured."}, origin)
        author = f"urn:li:organization:{ORGANIZATION_ID}"
        content = None
        attachment = body.get("attachment")
        if attachment:
            content_type = attachment.get("contentType")
            if content_type not in ("image/png", "image/jpeg"):
                return response(400, {"error": "LinkedIn publishing accepts PNG or JPEG attachments."}, origin)
            image_bytes = base64.b64decode(attachment.get("base64", ""), validate=True)
            if not image_bytes or len(image_bytes) > 6 * 1024 * 1024:
                return response(400, {"error": "The image must be 6 MB or smaller."}, origin)
            initialized, _ = request_json(
                "POST", "https://api.linkedin.com/rest/images?action=initializeUpload",
                token=member["accessToken"], body={"initializeUploadRequest": {"owner": author}},
            )
            upload = initialized["value"]
            put_image(upload["uploadUrl"], image_bytes, content_type, member["accessToken"])
            content = {"media": {"id": upload["image"], "altText": str(attachment.get("altText", "Article image"))[:4086]}}

        post_body = {
            "author": author, "commentary": commentary, "visibility": "PUBLIC",
            "distribution": {"feedDistribution": "MAIN_FEED", "targetEntities": [], "thirdPartyDistributionChannels": []},
            "lifecycleState": "PUBLISHED", "isReshareDisabledByAuthor": False,
        }
        if content:
            post_body["content"] = content
        _, headers = request_json("POST", "https://api.linkedin.com/rest/posts", token=member["accessToken"], body=post_body)
        post_id = headers.get("x-restli-id") or headers.get("X-RestLi-Id")
        return response(201, {"published": True, "postId": post_id}, origin)
    except Exception as error:
        print(f"LinkedIn integration error: {type(error).__name__}")
        return response(502, {"error": "LinkedIn could not complete the request. Verify the connection and app permissions."}, origin)
