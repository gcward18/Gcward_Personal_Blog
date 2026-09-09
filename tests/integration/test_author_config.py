#!/usr/bin/env python3
"""Verify that the deployed Author Studio configuration is publicly readable."""

import argparse
import json
import os
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


REQUIRED_FIELDS = {
    "clientId",
    "authorizeUrl",
    "publishApiUrl",
    "assistantApiUrl",
    "linkedinApiUrl",
}


def validate_author_config(payload: object) -> None:
    if not isinstance(payload, dict):
        raise AssertionError("Author configuration must be a JSON object.")

    missing = REQUIRED_FIELDS.difference(payload)
    if missing:
        raise AssertionError(
            f"Author configuration is missing fields: {', '.join(sorted(missing))}"
        )

    if not isinstance(payload["clientId"], str) or not payload["clientId"].strip():
        raise AssertionError("clientId must be a non-empty string.")

    expected_paths = {
        "authorizeUrl": "/oauth2/authorize",
        "publishApiUrl": "/articles",
        "assistantApiUrl": "/assistant",
        "linkedinApiUrl": "/linkedin",
    }
    for field, expected_path in expected_paths.items():
        value = payload[field]
        if not isinstance(value, str):
            raise AssertionError(f"{field} must be a string.")

        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.netloc:
            raise AssertionError(f"{field} must be an absolute HTTPS URL.")
        if not parsed.path.rstrip("/").endswith(expected_path):
            raise AssertionError(f"{field} must end with {expected_path}.")


def fetch_author_config(base_url: str, timeout: float = 10) -> dict:
    config_url = urljoin(f"{base_url.rstrip('/')}/", "author-config.json")
    request = Request(
        config_url,
        headers={
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "User-Agent": "curious-engineer-deployment-test/1.0",
        },
    )

    with urlopen(request, timeout=timeout) as response:
        content_type = response.headers.get_content_type()
        body = response.read().decode("utf-8")

    if content_type != "application/json":
        raise AssertionError(
            "Expected application/json from author-config.json, "
            f"received {content_type}. The SPA fallback may have been returned."
        )

    try:
        payload = json.loads(body)
    except json.JSONDecodeError as error:
        raise AssertionError("Author configuration contains invalid JSON.") from error

    validate_author_config(payload)
    return payload


def wait_for_author_config(
    base_url: str,
    attempts: int = 12,
    retry_delay: float = 5,
) -> dict:
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            return fetch_author_config(base_url)
        except (AssertionError, HTTPError, URLError, TimeoutError) as error:
            last_error = error
            if attempt == attempts:
                break
            print(f"Attempt {attempt}/{attempts} failed; retrying in {retry_delay:g}s.")
            time.sleep(retry_delay)

    raise AssertionError(
        f"Author configuration was not ready after {attempts} attempts: {last_error}"
    ) from last_error


class AuthorConfigIntegrationTest(unittest.TestCase):
    @unittest.skipUnless(
        os.getenv("BLOG_BASE_URL"),
        "BLOG_BASE_URL is not set; skipping the deployed-site test.",
    )
    def test_deployed_author_config(self) -> None:
        wait_for_author_config(os.environ["BLOG_BASE_URL"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "base_url",
        help="Public blog URL, for example https://thecuriousengineerblog.dev",
    )
    args = parser.parse_args()

    wait_for_author_config(args.base_url)
    print("Author configuration integration test passed.")


if __name__ == "__main__":
    main()
