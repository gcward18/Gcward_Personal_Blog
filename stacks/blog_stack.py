import os
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
            default_root_object="index.html"
        )

        # 5. Deploy website content
        s3deploy.BucketDeployment(
            self, "DeployWebsite",
            sources=[s3deploy.Source.asset("./frontend/dist")],# Points to Vite dist folder
            destination_bucket=site_bucket,
            distribution=distribution
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