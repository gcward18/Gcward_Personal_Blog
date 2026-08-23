import aws_cdk as cdk
from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    aws_ssm as ssm,
    aws_secretsmanager as secretsmanager,
    aws_lambda as _lambda,
)
from constructs import Construct

class LlmServiceStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # 1. SSM Parameter for allowed CORS origins (Config Management)
        allowed_origins_param = ssm.StringParameter(
            self, "AllowedOriginsParam",
            parameter_name="/config/llm_service/allowed_origins",
            string_value="https://d370wx9356fabh.cloudfront.net",
            description="Comma-separated list of allowed origins for CORS"
        )

        # 2. Fetch parameter value and split into a list for CDK CORS configuration
        origins_list = allowed_origins_param.string_value.split(",")

        # 3. Secrets Manager entry for LLM API Key
        openai_api_key_secret = secretsmanager.Secret(
            self, "OpenAiApiKeySecret",
            secret_name="OPENAI_API_KEY",
            secret_string_value=cdk.SecretValue.unsafe_plain_text("REPLACE_ME_WITH_REAL_API_KEY")
        )
        tavily_secret = secretsmanager.Secret(
            self, "TavilyApiKeySecret",
            secret_name="TAVILY_API_KEY",
            secret_string_value=cdk.SecretValue.unsafe_plain_text("REPLACE_ME_WITH_REAL_API_KEY")
        )

        # 4. Lambda Function
        handler = _lambda.Function(
            self, "LlmQueryHandler",
            runtime=_lambda.Runtime.PYTHON_3_12,
            code=_lambda.Code.from_asset("lambda"),
            handler="llm.index.handler",
            timeout=Duration.seconds(30),
            memory_size=512,
            environment={
                "OPENAI_API_KEY": openai_api_key_secret.secret_name,
                "TAVILY_APIKEY": tavily_secret.secret_name,
                "ALLOWED_ORIGINS_PARAM": allowed_origins_param.parameter_name
            }
        )

        # Grant permissions
        openai_api_key_secret.grant_read(handler)
        allowed_origins_param.grant_read(handler)

        # 5. Function URL configured with origins from Config
        function_url = handler.add_function_url(
            auth_type=_lambda.FunctionUrlAuthType.NONE,
            cors=_lambda.FunctionUrlCorsOptions(
                allowed_origins=origins_list,
                allowed_methods=[_lambda.HttpMethod.POST],
                allowed_headers=["content-type"],
                max_age=Duration.hours(1)
            )
        )

        CfnOutput(self, "LlmEndpointUrl", value=function_url.url)