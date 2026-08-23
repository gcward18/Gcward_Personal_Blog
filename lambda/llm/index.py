import sys
import os

# Only append local vendor path inside AWS Lambda, not when running on local Mac
if os.environ.get("AWS_EXECUTION_ENV"):
    sys.path.append(os.path.dirname(os.path.realpath(__file__)))

import json
import boto3
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langchain_tavily import TavilySearch

# Initialize AWS clients
ssm = boto3.client('ssm')
secrets = boto3.client('secretsmanager')


def handler(event, context):
    headers = event.get('headers', {})
    request_origin = headers.get('origin') or headers.get('Origin')

    # Fetch dynamic allowed origins from SSM Parameter Store (with local fallback)
    param_name = os.environ.get('ALLOWED_ORIGINS_PARAM', '')
    try:
        param_response = ssm.get_parameter(Name=param_name)
        allowed_origins = [o.strip() for o in param_response['Parameter']['Value'].split(',')]
    except Exception:
        # Fallback allowed origin when running locally or if SSM parameter isn't found
        allowed_origins = [request_origin] if request_origin else ["*"]

    # Runtime Origin Check
    if request_origin and request_origin not in allowed_origins and "*" not in allowed_origins:
        return {
            "statusCode": 403,
            "body": json.dumps({"error": "Forbidden: Origin not allowed"})
        }

    # Extract user input (Handles both Console Test Events and HTTP API Gateway / Function URLs)
    if 'body' in event and event['body']:
        body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
    else:
        body = event

    user_query = body.get('query')

    if not user_query:
        return {
            "statusCode": 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": request_origin if request_origin in allowed_origins else ""
            },
            "body": json.dumps({"error": "Bad Request: Missing or invalid 'query' parameter"})
        }

    # 1. Resolve OpenAI API Key (Tries Secrets Manager first, falls back to direct env key)
    openai_env_val = os.environ.get('OPENAI_API_KEY', '')
    try:
        llm_api_key = secrets.get_secret_value(SecretId=openai_env_val)['SecretString']
    except Exception:
        llm_api_key = openai_env_val

    # 2. Resolve Tavily API Key (Tries Secrets Manager first, falls back to direct env key)
    tavily_env_val = os.environ.get('TAVILY_APIKEY') or os.environ.get('TAVILY_API_KEY', '')
    try:
        tavily_api_key = secrets.get_secret_value(SecretId=tavily_env_val)['SecretString']
    except Exception:
        tavily_api_key = tavily_env_val

    # Set environment variable required by LangChain's Tavily tool
    os.environ['TAVILY_API_KEY'] = tavily_api_key

    # 3. Fetch Search Context via Tavily
    search_context = ""
    try:
        tavily_tool = TavilySearch(max_results=5, search_depth="advanced")
        raw_results = tavily_tool.invoke(f"{user_query} total revenue annual financial report")

        # Parse Tavily results into readable context
        if isinstance(raw_results, list):
            search_context = "\n\n".join([
                f"Source: {item.get('url', '')}\nContent: {item.get('content', '')}"
                for item in raw_results if isinstance(item, dict)
            ])
        elif isinstance(raw_results, dict):
            results_list = raw_results.get("results", [])
            search_context = "\n\n".join([
                f"Source: {item.get('url', '')}\nContent: {item.get('content', '')}"
                for item in results_list
            ])
        else:
            search_context = str(raw_results)

    except Exception as e:
        print(f"Tavily Execution Error: {str(e)}")
        search_context = f"Search unavailable: {str(e)}"

    # 4. Define Prompt & Chain
    prompt = ChatPromptTemplate.from_messages([
        ("system", (
            "You are a direct, concise AI assistant for customer-facing applications.\n\n"
            "Rules:\n"
            "1. Clarify user intent or complex concepts with minimal fluff.\n"
            "2. Provide short, bulleted, or structured responses prioritizing immediate clarity.\n"
            "3. Ground factual details strictly in the provided Search Context below.\n"
            "Search Context:\n{context}"
        )),
        ("user", "{query}")
    ])

    llm = ChatOpenAI(model="gpt-4o", api_key=llm_api_key, temperature=0)
    chain = prompt | llm

    # 5. Execute LLM Chain Call
    chain_response = chain.invoke({
        "context": search_context if search_context else "No context found.",
        "query": user_query
    })

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": request_origin if request_origin in allowed_origins else ""
        },
        "body": json.dumps({
            "status": "success",
            "message": chain_response.content
        })
    }
