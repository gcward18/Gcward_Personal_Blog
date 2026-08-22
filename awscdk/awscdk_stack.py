import aws_cdk as cdk
from aws_cdk import (
    Stack,
    CfnOutput,
    RemovalPolicy,
    aws_s3 as s3,
    aws_s3_deployment as s3deploy,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
)
from constructs import Construct

class AwscdkStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # 1. Private S3 Bucket
        site_bucket = s3.Bucket(
            self, "MyWebsiteBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL, # Fully secure
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True
        )

        # 2. CloudFront CDN Distribution
        distribution = cloudfront.Distribution(
            self, "SiteDistribution",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(site_bucket)
            ),
            default_root_object="index.html"
        )

        # 3. Deploy website content
        s3deploy.BucketDeployment(
            self, "DeployWebsite",
            sources=[s3deploy.Source.asset("./website")],
            destination_bucket=site_bucket,
            distribution=distribution # Automatically invalidates CDN cache on deploy
        )

        # 4. Output CloudFront Domain Name
        CfnOutput(
            self, "DistributionDomainName",
            value=distribution.distribution_domain_name,
            description="CloudFront Website URL"
        )