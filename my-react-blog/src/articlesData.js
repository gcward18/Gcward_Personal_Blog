// src/articlesData.js
export const ARTICLES = [
  {
    id: 'zero-cost-serverless-blog',
    siteName: 'System Architecture',
    siteUrl: '[https://thecuriousengineerblog.dev](https://thecuriousengineerblog.dev) › pages › zero-cost-serverless-blog',
    title: 'Building a Zero-Cost Serverless Blog with AWS CDK, S3, and Python',
    snippet: "Deploying a technical blog or portfolio shouldn't mean managing virtual servers or paying monthly hosting subscriptions...",
    tags: ['AWS CDK', 'Python', 'Serverless'],
    date: '2026-08',
    category: 'ARCHITECTURE_LESSONS',
    content: `
Deploying a personal blog or technical portfolio shouldn't mean managing virtual servers or paying monthly hosting subscriptions. By combining **AWS CDK (Python)**, **Amazon S3**, and **Amazon CloudFront**, you can build a serverless static blog that costs fractions of a cent to host and offers near-infinite scalability.

## 1. The Architecture Overview

Instead of configuring an S3 bucket as a public website endpoint, the security best practice is to keep the **S3 bucket completely private** (\`BlockPublicAccess.BLOCK_ALL\`).

\`\`\`text
[ Reader ] ---> [ CloudFront CDN (HTTPS) ] ---> [ S3 Bucket (Private Content) ]
                     ▲
                     │ (Origin Access Control)
\`\`\`

* **Amazon S3:** Stores compiled HTML, CSS, and media assets securely.
* **Amazon CloudFront:** Acts as a Content Delivery Network (CDN) to serve site traffic globally over HTTPS with ultra-low latency.
* **Origin Access Control (OAC):** Restricts access so users cannot bypass CloudFront or view bucket contents directly.

## 2. Infrastructure as Code: Python CDK Stack

This Python CDK stack provisions the private S3 bucket, configures CloudFront OAC, sets up an automated deployment pipeline for local web assets, and logs the public live URL.

\`\`\`python
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

class BlogInfrastructureStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # 1. Private S3 Bucket for static site assets
        site_bucket = s3.Bucket(
            self, "BlogAssetBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True
        )

        # 2. CloudFront CDN Distribution using Origin Access Control (OAC)
        distribution = cloudfront.Distribution(
            self, "BlogDistribution",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(site_bucket)
            ),
            default_root_object="index.html"
        )

        # 3. Automatic Deployment of local site assets to S3
        s3deploy.BucketDeployment(
            self, "DeployBlogAssets",
            sources=[s3deploy.Source.asset("./website")],
            destination_bucket=site_bucket,
            distribution=distribution
        )

        # 4. Output the public CloudFront URL
        CfnOutput(
            self, "LiveBlogURL",
            value=f"https://{distribution.distribution_domain_name}",
            description="Live HTTPS endpoint for the blog"
        )
\`\`\`

## 3. Automated Markdown Compilation Script

To avoid writing raw HTML manually for every article, use this lightweight Python build script. It parses markdown files (\`.md\`), wraps them in clean retro-styled HTML, and populates your public deployment folder.

\`\`\`python
import os
import glob
import markdown

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <link rel="stylesheet" href="./styles.css">
</head>
<body>
    <p><a href="./index.html">&lt;-- RETURN_TO_HOME</a></p>
    <article>
        {content}
    </article>
</body>
</html>
"""

def build_static_pages():
    os.makedirs("./website", exist_ok=True)
    os.makedirs("./posts", exist_ok=True)

    md_parser = markdown.Markdown(extensions=['fenced_code', 'tables'])

    for md_file in glob.glob("./posts/*.md"):
        filename = os.path.basename(md_file)
        slug = os.path.splitext(filename)[0]

        with open(md_file, "r", encoding="utf-8") as f:
            raw_markdown = f.read()

        html_body = md_parser.convert(raw_markdown)
        md_parser.reset()

        page_title = slug.replace("-", " ").title()
        formatted_html = HTML_TEMPLATE.format(title=page_title, content=html_body)

        output_file = f"./website/{slug}.html"
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(formatted_html)

        print(f"Successfully compiled: {md_file} -> {output_file}")

if __name__ == "__main__":
    build_static_pages()
\`\`\`

## 4. Cost Control & Safeguards

While S3 storage and CloudFront bandwidth fall within the **AWS Free Tier** for most small blogs (up to 1 TB of monthly outbound transfer), setting up an **AWS Budget Alert** prevents unexpected charges:

\`\`\`python
from aws_cdk import aws_budgets as budgets

budgets.CfnBudget(
    self, "MonthlyCostGuardrail",
    budget=budgets.CfnBudget.BudgetDataProperty(
        budget_name="BlogCostGuardrail",
        budget_type="COST",
        time_unit="MONTHLY",
        budget_limit=budgets.CfnBudget.SpendProperty(amount=1, unit="USD")
    ),
    notifications_with_subscribers=[
        budgets.CfnBudget.NotificationWithSubscribersProperty(
            notification=budgets.CfnBudget.NotificationProperty(
                comparison_operator="GREATER_THAN",
                notification_type="ACTUAL",
                threshold=100,
                threshold_type="PERCENTAGE"
            ),
            subscribers=[budgets.CfnBudget.SubscriberProperty(address="admin@example.com", subscription_type="EMAIL")]
        )
    ]
)
\`\`\`

## 5. Deployment Workflow

* Write your blog post in Markdown (\`./posts/my-first-post.md\`).
* Run \`python build_site.py\` to compile Markdown files to \`./website/\`.
* Execute \`cdk deploy\` to sync assets to AWS and refresh your live site.
`
  },
  {
    id: 'aws-cdk',
    siteName: 'System Architecture',
    siteUrl: '[https://thecuriousengineerblog.dev](https://thecuriousengineerblog.dev) › pages › aws-cdk',
    title: 'Demystifying AWS CDK: Infrastructure as Real Code',
    snippet: 'Managing cloud infrastructure through JSON or YAML templates often leads to unmaintainable configuration files. Learn how the AWS Cloud Development Kit allows you to define infrastructure...',
    tags: ['Infrastructure as Code', 'Cloud Architecture'],
    date: '2026-08',
    category: 'AWS_CDK',
    content: `
Managing cloud infrastructure through JSON or YAML templates (CloudFormation or Terraform) often leads to massive, unmaintainable configuration files. The **AWS Cloud Development Kit (CDK)** changes this paradigm by letting you define infrastructure using object-oriented languages like Python and TypeScript.

## Why Use CDK Over Raw CloudFormation?

* **Constructs & Defaults:** CDK abstracts boilerplate setup. A single construct like \`aws_s3.Bucket\` configures sensible security defaults automatically.
* **Type Safety & IDE Support:** Catch configuration syntax errors during compilation rather than mid-deployment.
* **Reusability:** Create reusable custom constructs across your team or organization.

## Key CDK Constructs Used in This Blog

\`\`\`python
# Python CDK snippet creating an S3 bucket with CloudFront OAC
site_bucket = s3.Bucket(
    self, "BlogBucket",
    block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
    removal_policy=RemovalPolicy.DESTROY
)
\`\`\`

By coupling S3 for asset storage and CloudFront as a CDN, CDK allows you to provision serverless web infrastructure in fewer than 40 lines of Python code.
`
  }
];