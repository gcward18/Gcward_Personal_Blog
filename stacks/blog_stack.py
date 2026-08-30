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

        # 4. CloudFront CDN Distribution
        distribution = cloudfront.Distribution(
            self, "SiteDistribution",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(site_bucket)
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

        s3deploy.BucketDeployment(
            self, "DeployWebsite",
            sources=[frontend_bundle],
            destination_bucket=site_bucket,
            distribution=distribution,
            distribution_paths=["/*"],
        )

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
