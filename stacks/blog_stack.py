import os
import subprocess
from pathlib import Path

from dotenv import load_dotenv
import aws_cdk as cdk
from aws_cdk import (
    Stack,
    CfnOutput,
    RemovalPolicy,
    aws_s3 as s3,
    aws_s3_deployment as s3deploy,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_certificatemanager as acm,
    aws_cognito as cognito,
    aws_apigateway as apigateway,
    aws_lambda as _lambda,
    aws_iam as iam,
    aws_dynamodb as dynamodb,
    aws_secretsmanager as secretsmanager,
    custom_resources as cr,
    aws_route53 as route53,
    aws_route53_targets as targets,
)
from constructs import Construct

# Load variables from .env file if present
load_dotenv()

class BlogStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Retrieve account, domain, and certificate configuration from environment variables
        domain_name = os.getenv("DOMAIN_NAME", "thecuriousengineerblog.dev")
        certificate_arn = os.getenv("ACM_CERTIFICATE_ARN")
        github_owner = os.getenv("GITHUB_OWNER", "gcward18")
        github_repository = os.getenv("GITHUB_REPOSITORY", "Gcward_Personal_Blog")

        if not certificate_arn:
            raise ValueError("ACM_CERTIFICATE_ARN environment variable must be set.")

        # 1. Fetch your existing Route 53 Hosted Zone
        hosted_zone = route53.HostedZone.from_lookup(
            self, "BlogHostedZone",
            domain_name=domain_name
        )

        # 2. Reference ACM Certificate using environment variable
        certificate = acm.Certificate.from_certificate_arn(
            self, "BlogCert",
            certificate_arn=certificate_arn
        )

        # 3. Private S3 Bucket
        site_bucket = s3.Bucket(
            self, "MyWebsiteBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True
        )

        # Public visitors are Readers and do not need an AWS identity. Authors
        # authenticate through Cognito and must belong to this managed group.
        author_pool = cognito.UserPool(
            self,
            "AuthorUserPool",
            self_sign_up_enabled=False,
            sign_in_aliases=cognito.SignInAliases(email=True),
            auto_verify=cognito.AutoVerifiedAttrs(email=True),
            password_policy=cognito.PasswordPolicy(
                min_length=12,
                require_digits=True,
                require_lowercase=True,
                require_uppercase=True,
                require_symbols=True,
            ),
            removal_policy=RemovalPolicy.RETAIN,
        )
        cognito.CfnUserPoolGroup(
            self,
            "AuthorsGroup",
            user_pool_id=author_pool.user_pool_id,
            group_name="Authors",
            description="May submit Curious Developer articles for GitHub review",
        )

        author_client = author_pool.add_client(
            "AuthorWebClient",
            auth_flows=cognito.AuthFlow(user_srp=True),
            o_auth=cognito.OAuthSettings(
                flows=cognito.OAuthFlows(implicit_code_grant=True),
                scopes=[
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.PROFILE,
                ],
                callback_urls=[
                    f"https://{domain_name}/author",
                    "http://localhost:5173/author",
                ],
                logout_urls=[
                    f"https://{domain_name}/",
                    "http://localhost:5173/",
                ],
            ),
        )
        author_domain = author_pool.add_domain(
            "AuthorDomain",
            cognito_domain=cognito.CognitoDomainOptions(
                domain_prefix=os.getenv(
                    "COGNITO_DOMAIN_PREFIX",
                    f"curious-developer-{self.account}",
                )
            ),
        )

        github_token = secretsmanager.Secret.from_secret_name_v2(
            self,
            "GitHubPublisherToken",
            os.getenv("GITHUB_TOKEN_SECRET_NAME", "curious-developer/github-token"),
        )
        publisher = _lambda.Function(
            self,
            "ArticlePublisher",
            runtime=_lambda.Runtime.PYTHON_3_12,
            code=_lambda.Code.from_asset("lambda/publisher"),
            handler="index.handler",
            timeout=cdk.Duration.seconds(30),
            memory_size=256,
            environment={
                "ALLOWED_ORIGINS": f"https://{domain_name},http://localhost:5173",
                "GITHUB_OWNER": github_owner,
                "GITHUB_REPOSITORY": github_repository,
                "GITHUB_BASE_BRANCH": "main",
                "GITHUB_TOKEN_SECRET": github_token.secret_name,
            },
        )
        github_token.grant_read(publisher)
        publisher.add_to_role_policy(
            iam.PolicyStatement(
                actions=["kms:Decrypt"],
                resources=["*"],
                conditions={
                    "StringEquals": {
                        "kms:ViaService": f"secretsmanager.{self.region}.amazonaws.com"
                    },
                    "StringLike": {
                        "kms:EncryptionContext:SecretARN": f"{github_token.secret_arn}*"
                    },
                },
            )
        )

        writing_assistant = _lambda.Function(
            self,
            "PremiumWritingAssistant",
            runtime=_lambda.Runtime.PYTHON_3_12,
            code=_lambda.Code.from_asset("lambda/assistant"),
            handler="index.handler",
            timeout=cdk.Duration.seconds(60),
            memory_size=512,
            environment={
                "ALLOWED_ORIGINS": f"https://{domain_name},http://localhost:5173",
                "BEDROCK_MODEL_ID": os.getenv(
                    "BEDROCK_MODEL_ID",
                    "amazon.nova-lite-v1:0",
                ),
                "BEDROCK_IMAGE_MODEL_ID": os.getenv(
                    "BEDROCK_IMAGE_MODEL_ID",
                    "amazon.nova-canvas-v1:0",
                ),
                "PREMIUM_GROUPS": os.getenv("PREMIUM_GROUPS", "Authors"),
                "SITE_URL": f"https://{domain_name}",
            },
        )
        writing_assistant.add_to_role_policy(
            iam.PolicyStatement(
                actions=["bedrock:InvokeModel"],
                resources=["*"],
            )
        )

        linkedin_secret = secretsmanager.Secret.from_secret_name_v2(
            self,
            "LinkedInClientSecret",
            os.getenv("LINKEDIN_CLIENT_SECRET_NAME", "curious-developer/linkedin-client-secret"),
        )
        linkedin_connections = dynamodb.Table(
            self,
            "LinkedInConnections",
            partition_key=dynamodb.Attribute(name="pk", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption=dynamodb.TableEncryption.AWS_MANAGED,
            time_to_live_attribute="ttl",
            removal_policy=RemovalPolicy.RETAIN,
        )
        linkedin_publisher = _lambda.Function(
            self,
            "LinkedInPublisher",
            runtime=_lambda.Runtime.PYTHON_3_12,
            code=_lambda.Code.from_asset("lambda/linkedin"),
            handler="index.handler",
            timeout=cdk.Duration.seconds(60),
            memory_size=512,
            environment={
                "ALLOWED_ORIGINS": f"https://{domain_name},http://localhost:5173",
                "LINKEDIN_CLIENT_ID": os.getenv("LINKEDIN_CLIENT_ID", "configure-linkedin-client-id"),
                "LINKEDIN_CLIENT_SECRET": linkedin_secret.secret_name,
                "LINKEDIN_REDIRECT_URI": f"https://{domain_name}/author",
                "LINKEDIN_TABLE": linkedin_connections.table_name,
                "LINKEDIN_VERSION": os.getenv("LINKEDIN_VERSION", "202608"),
                "LINKEDIN_ORGANIZATION_ID": os.getenv("LINKEDIN_ORGANIZATION_ID", ""),
                "LINKEDIN_ORGANIZATION_NAME": os.getenv("LINKEDIN_ORGANIZATION_NAME", "LinkedIn company page"),
                "PREMIUM_GROUPS": os.getenv("PREMIUM_GROUPS", "Authors"),
            },
        )
        linkedin_connections.grant_read_write_data(linkedin_publisher)
        linkedin_secret.grant_read(linkedin_publisher)

        publishing_api = apigateway.RestApi(
            self,
            "PublishingApi",
            rest_api_name="Curious Developer Publishing API",
            default_cors_preflight_options=apigateway.CorsOptions(
                allow_origins=[f"https://{domain_name}", "http://localhost:5173"],
                allow_methods=["POST", "OPTIONS"],
                allow_headers=["Authorization", "Content-Type"],
            ),
        )
        gateway_cors_headers = {
            "Access-Control-Allow-Origin": f"'https://{domain_name}'",
            "Access-Control-Allow-Headers": "'Authorization,Content-Type'",
            "Access-Control-Allow-Methods": "'POST,OPTIONS'",
        }
        publishing_api.add_gateway_response(
            "PublishingDefault4xx",
            type=apigateway.ResponseType.DEFAULT_4_XX,
            response_headers=gateway_cors_headers,
        )
        publishing_api.add_gateway_response(
            "PublishingDefault5xx",
            type=apigateway.ResponseType.DEFAULT_5_XX,
            response_headers=gateway_cors_headers,
        )
        authorizer = apigateway.CognitoUserPoolsAuthorizer(
            self,
            "Authorizer",
            cognito_user_pools=[author_pool],
        )
        publishing_api.root.add_resource("articles").add_method(
            "POST",
            apigateway.LambdaIntegration(publisher),
            authorizer=authorizer,
            authorization_type=apigateway.AuthorizationType.COGNITO,
        )
        publishing_api.root.add_resource("assistant").add_method(
            "POST",
            apigateway.LambdaIntegration(writing_assistant),
            authorizer=authorizer,
            authorization_type=apigateway.AuthorizationType.COGNITO,
        )
        publishing_api.root.add_resource("linkedin").add_method(
            "POST",
            apigateway.LambdaIntegration(linkedin_publisher),
            authorizer=authorizer,
            authorization_type=apigateway.AuthorizationType.COGNITO,
        )

        # 4. CloudFront CDN Distribution
        article_page_rewrite = cloudfront.Function(
            self,
            "ArticlePageRewrite",
            runtime=cloudfront.FunctionRuntime.JS_2_0,
            code=cloudfront.FunctionCode.from_inline(
                """function handler(event) {
  var request = event.request;
  if (/^\\/pages\\/[a-z0-9-]+\\/?$/.test(request.uri)) {
    request.uri = request.uri.replace(/\\/?$/, '/index.html');
  }
  return request;
}"""
            ),
        )

        distribution = cloudfront.Distribution(
            self, "SiteDistribution",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(site_bucket),
                function_associations=[
                    cloudfront.FunctionAssociation(
                        function=article_page_rewrite,
                        event_type=cloudfront.FunctionEventType.VIEWER_REQUEST,
                    )
                ],
            ),
            domain_names=[domain_name],
            certificate=certificate,
            default_root_object="index.html",
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=cdk.Duration.seconds(0),
                ),
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=cdk.Duration.seconds(0),
                ),
            ],
        )

        # 5. Build the Vite application before CDK stages the deployment asset.
        # Using the checked-in lockfile makes the install reproducible, and
        # avoids requiring Docker merely to synthesize or deploy this stack.
        frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
        try:
            subprocess.run(["npm", "ci"], cwd=frontend_dir, check=True)
            subprocess.run(["npm", "run", "build"], cwd=frontend_dir, check=True)
        except FileNotFoundError as error:
            raise RuntimeError(
                "Node.js and npm must be installed before deploying BlogStack."
            ) from error
        except subprocess.CalledProcessError as error:
            raise RuntimeError(
                "The frontend production build failed; S3 deployment was stopped."
            ) from error

        frontend_bundle = s3deploy.Source.asset(str(frontend_dir / "dist"))

        website_deployment = s3deploy.BucketDeployment(
            self, "DeployWebsite",
            sources=[frontend_bundle],
            destination_bucket=site_bucket,
            distribution=distribution,
            distribution_paths=["/*"],
        )

        # Runtime configuration contains only public identifiers. Writing it
        # after BucketDeployment prevents pruning from removing the file.
        author_config = cdk.Stack.of(self).to_json_string(
            {
                "clientId": author_client.user_pool_client_id,
                "authorizeUrl": f"{author_domain.base_url()}/oauth2/authorize",
                "publishApiUrl": f"{publishing_api.url}articles",
                "assistantApiUrl": f"{publishing_api.url}assistant",
                "linkedinApiUrl": f"{publishing_api.url}linkedin",
            }
        )
        config_writer = cr.AwsCustomResource(
            self,
            "AuthorConfigWriter",
            on_create=cr.AwsSdkCall(
                service="S3",
                action="putObject",
                parameters={
                    "Bucket": site_bucket.bucket_name,
                    "Key": "author-config.json",
                    "Body": author_config,
                    "ContentType": "application/json",
                    "CacheControl": "no-store",
                },
                physical_resource_id=cr.PhysicalResourceId.of("author-config"),
            ),
            on_update=cr.AwsSdkCall(
                service="S3",
                action="putObject",
                parameters={
                    "Bucket": site_bucket.bucket_name,
                    "Key": "author-config.json",
                    "Body": author_config,
                    "ContentType": "application/json",
                    "CacheControl": "no-store",
                },
                physical_resource_id=cr.PhysicalResourceId.of("author-config"),
            ),
            policy=cr.AwsCustomResourcePolicy.from_sdk_calls(
                resources=[site_bucket.arn_for_objects("author-config.json")]
            ),
        )
        config_writer.node.add_dependency(website_deployment)

        # Route 53 Records
        route53.ARecord(
            self, "ApexAlias",
            zone=hosted_zone,
            target=route53.RecordTarget.from_alias(
                targets.CloudFrontTarget(distribution)
            )
        )

        route53.ARecord(
            self, "WwwAlias",
            zone=hosted_zone,
            record_name="www",
            target=route53.RecordTarget.from_alias(
                targets.CloudFrontTarget(distribution)
            )
        )

        # Output CloudFront Domain Name
        CfnOutput(
            self, "DistributionDomainName",
            value=distribution.distribution_domain_name,
            description="CloudFront Website URL"
        )
