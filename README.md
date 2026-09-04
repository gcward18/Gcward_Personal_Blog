# The Curious Engineer Blog

[The Curious Engineer](https://thecuriousengineerblog.dev) is a technical blog and learning lab built on AWS. I use it to publish regular posts about the technologies, architecture patterns, and engineering ideas I am learning—including AWS, infrastructure as code, serverless systems, and AI.

The site is also a project in its own right. Its infrastructure is defined in Python with the AWS Cloud Development Kit (CDK), deployed to AWS, and designed to keep the cost at or near zero for a small personal site.

## How it works

```text
Reader
  |
  v
Route 53 + CloudFront
  |
  v
Private S3 bucket
  |
  v
Statically built React site
```

- **React and Vite** build the blog into static HTML, CSS, and JavaScript.
- **Amazon S3** stores the generated site in a private bucket.
- **Amazon CloudFront** serves the site globally over HTTPS and is the only service allowed to read the bucket.
- **Route 53 and ACM** connect the CloudFront distribution to the custom domain.
- **AWS CDK (Python)** defines and deploys the infrastructure.
- **GitHub Actions with AWS OIDC** deploys approved changes without storing long-lived AWS credentials.
- **AWS Budgets** sends alerts if monthly account costs cross the configured thresholds.

The repository also includes an authenticated author workflow backed by Amazon Cognito, API Gateway, and Lambda. Additional agentic features—tools that can help research, draft, review, and publish content—are planned for future iterations.

## Hosting a site like this for free

The lowest-cost version uses a private S3 bucket behind CloudFront and keeps the AWS-generated `*.cloudfront.net` address. For a small site that remains within AWS's applicable free allowances, the hosting services can cost $0. A custom domain is optional and introduces domain-registration and DNS costs.

Read the full walkthrough: **[Building a Near-Zero-Cost Serverless Blog with AWS CDK, S3, and Python](https://thecuriousengineerblog.dev/pages/zero-cost-serverless-blog)**.

AWS free offers and pricing can change, and exceeding an allowance can create charges. Review the current [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/), [S3 pricing](https://aws.amazon.com/s3/pricing/), and [Route 53 pricing](https://aws.amazon.com/route53/pricing/) before deploying.

## Project structure

| Path | Purpose |
| --- | --- |
| `frontend/` | React/Vite blog, article catalog, and author interface |
| `stacks/blog_stack.py` | Static hosting, CDN, authentication, and publishing API |
| `stacks/budget_stack.py` | Monthly cost alerts |
| `stacks/llm_stack.py` | Experimental LLM service infrastructure |
| `lambda/` | Publishing and writing-assistant functions |
| `.github/workflows/deploy-blog.yml` | OIDC-based production deployment |

## Run locally

Install the frontend dependencies and start the Vite development server:

```bash
cd frontend
npm install
npm run dev
```

## Deploy the infrastructure

You need Python, Node.js, the AWS CLI, and the AWS CDK CLI. This repository's production stack expects an existing Route 53 hosted zone and ACM certificate for the custom domain.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm install --global aws-cdk

export AWS_ACCOUNT_ID="123456789012"
export AWS_REGION="us-east-1"
export EMAIL="you@example.com"
export DOMAIN_NAME="example.com"
export ACM_CERTIFICATE_ARN="arn:aws:acm:us-east-1:123456789012:certificate/..."

cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION
cdk diff
cdk deploy BlogStack BlogBudgetStack
```

For the complete production and publishing workflow, see [DEPLOYMENT.md](docs/DEPLOYMENT.md) and [PUBLISHING.md](docs/PUBLISHING.md).

## Useful commands

```bash
cdk ls       # List stacks
cdk synth    # Generate CloudFormation templates
cdk diff     # Compare local infrastructure with AWS
cdk deploy   # Deploy stacks to AWS
```

## Roadmap

- Continue publishing practical notes about what I am learning.
- Expand the authoring and review workflow.
- Add agentic research and content-assistance features with clear human approval steps.
- Keep the public site static, fast, secure, and inexpensive to operate.
