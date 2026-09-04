// src/articlesData.js
export const ARTICLES = [
  {
    id: 'aws-cross-account-iam-roles',
    siteName: 'AWS Identity & Access',
    siteUrl: 'thecuriousengineerblog.dev › pages › aws-cross-account-iam-roles',
    title: 'How AWS IAM Roles Enable Secure Cross-Account Access',
    snippet: 'Learn how trust policies, identity policies, and AWS STS work together to let a principal in one AWS account securely access resources in another.',
    tags: ['AWS IAM', 'Security', 'Cross-Account', 'AWS CDK'],
    date: '2026-08',
    category: 'AWS_SECURITY',
    content: `
AWS accounts are useful security boundaries. A common design is to keep workloads, shared services, security tooling, and production environments in separate accounts. But separation creates a practical question: **how can an identity in one account access resources in another without sharing long-lived credentials?**

The answer is an **IAM role in the destination account** and temporary credentials issued by **AWS Security Token Service (STS)**.

## The scenario

Imagine two accounts:

* **Account A — Application account (111111111111):** contains a workload role named DeploymentRole.
* **Account B — Production account (222222222222):** contains a private S3 bucket and a role named ProductionReadRole.

The application identity does not receive credentials for Account B. Instead, it asks STS to assume the role that Account B created for this purpose.

~~~mermaid
sequenceDiagram
    autonumber
    participant Caller as DeploymentRole<br/>Account A
    participant STS as AWS STS
    participant Role as ProductionReadRole<br/>Account B
    participant S3 as Production S3 Bucket<br/>Account B

    Caller->>STS: AssumeRole(ProductionReadRole)
    STS->>Role: Evaluate role trust policy
    Role-->>STS: Caller is trusted
    STS-->>Caller: Temporary access key, secret, and session token
    Caller->>S3: GetObject using temporary credentials
    S3-->>Caller: Object (if role permissions allow it)
~~~

## The two permissions that must agree

Cross-account role assumption is easiest to understand as a handshake. Both sides must opt in.

1. **The destination role's trust policy** says *who may assume this role*.
2. **The source identity's permissions policy** says *which roles this identity may attempt to assume*.

After the role is assumed, a third policy becomes relevant: the destination role's **permissions policy** determines what the temporary session may do.

| Policy | Attached in | Answers |
| --- | --- | --- |
| Trust policy | Account B | Who may assume this role? |
| Identity policy | Account A | May this caller invoke sts:AssumeRole on that role? |
| Role permissions policy | Account B | What may the assumed-role session access? |

## 1. Trust the source principal

Account B creates ProductionReadRole with this trust policy. Trusting a specific role is safer than trusting every identity in the source account.

~~~json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::111111111111:role/DeploymentRole"
    },
    "Action": "sts:AssumeRole"
  }]
}
~~~

A trust policy does not grant access to S3, DynamoDB, or any other service. It only defines who can obtain a session for the role.

## 2. Allow the source to assume the role

Account A attaches this policy to DeploymentRole:

~~~json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "sts:AssumeRole",
    "Resource": "arn:aws:iam::222222222222:role/ProductionReadRole"
  }]
}
~~~

The exact role ARN keeps the permission narrowly scoped. A wildcard would allow attempts to assume unrelated roles.

## 3. Grant the destination role only what it needs

Account B gives ProductionReadRole permission to list one bucket and read its objects:

~~~json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::production-reports"
    },
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::production-reports/*"
    }
  ]
}
~~~

These permissions become the ceiling for the temporary role session. Permission boundaries, session policies, service control policies, resource policies, and explicit denies can reduce the effective permissions further.

## Assuming the role with the AWS CLI

The caller can request a session directly:

~~~bash
aws sts assume-role \
  --role-arn arn:aws:iam::222222222222:role/ProductionReadRole \
  --role-session-name deployment-read
~~~

STS returns a temporary access key, secret access key, session token, and expiration time. SDK credential providers and named AWS CLI profiles can perform this exchange automatically, so applications should not store the returned credentials in source code.

~~~ini
[profile production-read]
role_arn = arn:aws:iam::222222222222:role/ProductionReadRole
source_profile = application
role_session_name = deployment-read
~~~

Then use the role session without manually exporting credentials:

~~~bash
aws s3 ls s3://production-reports --profile production-read
~~~

## Defining the destination role with AWS CDK

This Python CDK code belongs in a stack deployed to Account B:

~~~python
from aws_cdk import Stack, aws_iam as iam, aws_s3 as s3
from constructs import Construct


class ProductionAccessStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        reports_bucket = s3.Bucket.from_bucket_name(
            self, "ReportsBucket", "production-reports"
        )

        production_read_role = iam.Role(
            self,
            "ProductionReadRole",
            role_name="ProductionReadRole",
            assumed_by=iam.ArnPrincipal(
                "arn:aws:iam::111111111111:role/DeploymentRole"
            ),
            description="Read production reports from the application account",
        )

        reports_bucket.grant_read(production_read_role)
~~~

Account A still needs a policy granting sts:AssumeRole on the new role. Keeping each account's policy in its own stack makes ownership and deployment order clearer.

## Security guardrails

* **Trust exact principals.** Avoid trusting an entire account unless that broader delegation is intentional and controlled.
* **Use least privilege on both sides.** Scope sts:AssumeRole to an exact role ARN and scope destination permissions to required actions and resources.
* **Use an external ID for third parties.** When a vendor assumes a role in your account, require a unique sts:ExternalId condition to reduce confused-deputy risk.
* **Require MFA for sensitive human access.** A trust-policy condition can check aws:MultiFactorAuthPresent.
* **Prefer short sessions.** Temporary credentials reduce exposure, but session duration should still match the task.
* **Log and alert.** CloudTrail records AssumeRole and subsequent API activity under the role session. Use meaningful session names so activity is attributable.
* **Do not pass role credentials between services.** Let each workload assume roles through its AWS SDK credential provider.

## A useful debugging checklist

When AssumeRole returns AccessDenied, verify the destination trust policy, the source identity policy, the exact partition/account/role ARN, and any explicit deny from an SCP or permissions boundary. If role assumption succeeds but the service call fails, inspect the role permissions, target resource policy, encryption-key policy, and organizational controls.

The key mental model is simple: **Account B owns the role and decides who can assume it; Account A authorizes its identity to make the request; STS issues a temporary session whose actions are constrained by Account B's permissions.**
`
  },
  {
    id: 'zero-cost-serverless-blog',
    siteName: 'System Architecture',
    siteUrl: '[https://thecuriousengineerblog.dev](https://thecuriousengineerblog.dev) › pages › zero-cost-serverless-blog',
    title: 'Building a Near-Zero-Cost Serverless Blog with AWS CDK, S3, and Python',
    snippet: "Deploying a technical blog or portfolio shouldn't mean managing virtual servers or paying monthly hosting subscriptions...",
    tags: ['AWS CDK', 'Python', 'Serverless'],
    date: '2026-08',
    category: 'ARCHITECTURE_LESSONS',
    content: `
Deploying a personal blog or technical portfolio shouldn't mean managing virtual servers or paying a fixed monthly hosting subscription. By combining **AWS CDK (Python)**, **Amazon S3**, and **Amazon CloudFront**, you can build a serverless static blog that can cost $0 for light usage that stays within AWS's applicable free allowances.

The important word is **can**. AWS services are usage-based, free offers and limits can change, and a custom domain is not free. This guide shows the lowest-cost hosting path first and explains the optional paid pieces separately.

## The Free-Tier Path

To give this architecture the best chance of costing $0:

1. Store only the compiled static site in a private S3 bucket.
2. Serve it through CloudFront and use the generated \`https://<distribution>.cloudfront.net\` URL.
3. Do not add Route 53 or buy a domain unless you want a custom address.
4. Avoid optional services such as Lambda@Edge, real-time logs, and frequent paid invalidations.
5. Create a small AWS Budget and enable Free Tier usage alerts before publishing.
6. Monitor usage and current pricing; free allowances are not hard spending limits.

CloudFront currently documents a recurring free allowance for data transfer and HTTP/HTTPS requests. Check the official [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/) and [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/) pages before deploying because eligibility, plans, and limits may change.

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

S3 storage and CloudFront delivery can remain inside AWS's free allowances for a small blog, but neither service is an unlimited free host. A budget notification helps you spot charges early; it does **not** stop resources or impose a hard spending cap.

The following CDK construct creates a $1 monthly alert. Use an email address you monitor and confirm the subscription message from AWS:

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

You can also enable AWS Free Tier usage alerts in the Billing console. If you need a strict no-charge experiment and your account is eligible, review AWS's current Free Plan terms before creating resources.

## 5. Optional Custom Domain Costs

CloudFront supplies an HTTPS URL at no additional domain-registration cost. That is the free path used by the example stack above.

This live blog uses \`thecuriousengineerblog.dev\` instead. A custom domain normally adds:

* An annual domain-registration or renewal fee.
* Route 53 public hosted-zone charges and possibly DNS query charges.
* An ACM public certificate for CloudFront, which AWS provides without an additional certificate charge, although the surrounding AWS resources can still incur charges.

See the current [Route 53 pricing](https://aws.amazon.com/route53/pricing/) before choosing the custom-domain option.

## 6. Deployment Workflow

* Write your blog post in Markdown (\`./posts/my-first-post.md\`).
* Run \`python build_site.py\` to compile Markdown files to \`./website/\`.
* Execute \`cdk deploy\` to sync assets to AWS and refresh your live site.
`
  },
  {
    id: 'aws-cdk',
    siteName: 'Why AWS CDK',
    siteUrl: '[https://thecuriousengineerblog.dev](https://thecuriousengineerblog.dev) › pages › aws-cdk',
    title: 'Demystifying AWS CDK: Infrastructure as Real Code',
    snippet: 'Managing cloud infrastructure through JSON or YAML templates often leads to unmaintainable configuration files. Learn how the AWS Cloud Development Kit allows you to define infrastructure...',
    tags: ['IAC', 'Cloud Architecture'],
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
  },
  {
    id: 'cosine-similarity',
    siteName: 'Cosine Similarity',
    siteUrl: '[https://thecuriousengineerblog.dev](https://thecuriousengineerblog.dev) › pages › cosine-similarity',
    title: 'Light Bulb Moment: Cosine Similarity for finding nearest neighbors in high-dimensional vector space',
    snippet: 'Learn how cosine similarity helps retrieval-augmented generation find semantically related content in high-dimensional vector space.',
    tags: ['AI', 'Embedding', 'LLM'],
    date: '2026-08', // Fixed key spelling from data to date
    category: 'AI',
    content: `
# RAG & Cosine Similarity: 

### How Machines Measure Meaning

Early into learning how Retrieval-Augmented Generation (RAG) works, I was faced with a fundamental question: 

***how do we efficiently find document sections that are actually relevant to a user's prompt?*** 

This is where cosine similarity comes into play. It provides a mathematical way to evaluate how similar two vectors are based on the direction they point in space: 
- _1.0_ Identical direction (highest semantic similarity)
- _0.5_ Moderate similarity / overlapping context
- _0.0_ Orthogonal / completely unrelated

Let's walk through the end-to-end RAG workflow to see exact step where cosine similarity powers semantic retrieval.

RAG Sequence DiagramCode
\`\`\`mermaid
sequenceDiagram
    autonumber
    actor User
    participant Workflow
    participant Document
    participant Chunk
    participant Embedder
    participant VectorStore as Vector Store
    participant LLM

    %% Ingestion Phase
    rect rgb(240, 240, 240)
        note over Document, VectorStore: Ingestion Phase
        loop For each document
            Document->>Chunk: Process into smaller sections
            Chunk->>Embedder: Request vector embedding
            Embedder-->>VectorStore: Store chunk & vector embedding
        end
    end

    %% Query & Retrieval Phase
    rect rgb(225, 238, 248)
        note over User, LLM: Query & RAG Phase
        User->>Workflow: Send prompt / query
        Workflow->>Embedder: Embed user query
        Embedder-->>Workflow: Return query vector
        Workflow->>VectorStore: Query top-k relevant chunks (Cosine Similarity)
        VectorStore-->>Workflow: Return top-k documents
        Workflow->>LLM: Pass prompt + retrieved context
        LLM-->>Workflow: Return generated response
    end
\`\`\`

### Where Cosine Similarity Fits In
Cosine similarity operates directly in _Step 6_ of the query phase. When searching for relevant context, the Vector Database evaluates the user query vector against thousands or millions of document chunk vectors. It calculates the cosine of the angle _($\\theta$)_ between the vectors, measuring directional similarity while ignoring vector magnitude (length):

$$
\\text{Cosine Similarity}(A, B) = \\cos(\\theta) = \\frac{A \\cdot B}{\\|A\\| \\|B\\|}
$$

### Why Geometric Math Works for Language
It initially felt non-intuitive that a trigonometric function historically used for triangles and wave cycles could determine whether two sentences mean the same thing. 

**The secret lies in the embedding model:** 

Transformer networks take raw text and translate semantic concepts into high-dimensional numerical coordinates (often 768 to 1536 dimensions). Words and sentences with similar meanings (e.g., "king" and "queen", or "How to reset password" and "Forgot credential procedure") are placed near each other in this high-dimensional vector space. 

Once text is converted to spatial coordinates, finding relevant content transforms from a messy keyword matching problem into a precise k-nearest neighbors (k-NN) search. By ignoring the magnitude of the vector (which might scale with text length), cosine similarity focuses purely on semantic direction—giving us an accurate, scale-invariant score for context retrieval.
`
  }

];
