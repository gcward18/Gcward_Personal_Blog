# Curious Developer Publishing Workflow

For AWS and GitHub Actions setup, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Roles

| Role | Identity | Access |
| --- | --- | --- |
| Reader | Anonymous website visitor | Read published articles through CloudFront. The S3 origin remains private and cannot be read directly. No login is required. |
| Author | Cognito user in the `Authors` group | Sign in at `/author`, write Markdown, and create a GitHub pull request. Authors cannot publish directly. |
| Reviewer | Repository maintainer or designated GitHub reviewer | Review and merge or reject article pull requests. A merge to `main` starts production deployment. |
| Deployer | GitHub Actions through AWS OIDC | Build the approved frontend and deploy its static output to S3 and CloudFront. |

## Publishing sequence

1. An administrator creates a Cognito user and adds that user to the `Authors` group.
2. The author signs in through the Cognito hosted interface at `/author`.
3. The author submits a title, slug, summary, tags, and Markdown article.
4. API Gateway validates the Cognito ID token. The publisher Lambda also verifies the `Authors` group claim.
5. The Lambda reads a GitHub token from AWS Secrets Manager, creates an `article/...` branch, commits `frontend/src/content/<slug>.json`, and opens a pull request.
6. GitHub reviewers inspect the article. Branch protection should require approval before merge.
7. A merge to `main` runs `../.github/workflows/deploy-blog.yml`.
8. CDK installs locked frontend dependencies, creates the Vite production build, uploads only `../frontend/dist`, and invalidates CloudFront.

## Local development

Start the Vite development server from the frontend directory:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173/author`. Development mode does not require Cognito. The **Save locally** button writes the article to `frontend/src/content/<slug>.json`; Vite then reloads the article catalog automatically. This local endpoint is provided only by the Vite development server and is not included in the production build.

Run the development server only on a trusted machine and keep it bound to loopback. Do not use Vite's `--host` option on an untrusted or shared network: the unauthenticated local save endpoint is intended for development only. Treat previewed Markdown and Mermaid diagrams as untrusted content until they pass review.

To connect the premium AI assistant while developing locally, copy `.env.example` to `.env.local` and provide the deployed Cognito, publishing API, and assistant API values. Use **Connect premium AI** in the author studio to authenticate. Local article saving remains local; only assistant requests are sent to AWS.

## Premium AI writing assistant

The author studio can discuss an article with Amazon Bedrock, request a complete Markdown revision, review the resulting line diff, and accept or reject it. Accepted changes are written into the Markdown editor; the assistant never publishes an article.

`BlogStack` currently grants this feature to Cognito users in the `Authors` group. The Lambda also reads a comma-separated `PREMIUM_GROUPS` environment value, allowing a future subscription entitlement group to be added without changing application code. Set `BEDROCK_MODEL_ID` before deployment to override the default `amazon.nova-lite-v1:0` model.

The assistant API is protected by the Cognito authorizer and repeats the premium-group check inside Lambda before calling Bedrock. Ensure Amazon Bedrock model access is enabled in the deployment region.

## LinkedIn and social previews

The frontend build generates a static HTML entry point for every article under `dist/pages/<slug>/index.html`. Each page contains article-specific canonical, description, Open Graph, and large-card metadata. A CloudFront viewer-request function maps both `/pages/<slug>` and `/pages/<slug>/` to that generated entry point, allowing LinkedIn and other crawlers to read metadata without executing React.

Set `SITE_URL` during builds if deploying under a different public origin. The default is `https://thecuriousengineerblog.dev`. Replace `frontend/public/social-card.png` to customize the shared preview artwork while retaining its 1200 × 627 dimensions.

The premium assistant also provides a **Generate LinkedIn post** action. It uses the article title, summary, tags, Markdown, and canonical production URL to prepare an editable post of at most 3,000 characters. The author must review the draft and explicitly confirm before the backend publishes it.

The LinkedIn draft can include one optional PNG or JPEG image up to 6 MB, or use Amazon Nova Canvas to create a landscape editorial image from the article and the author's creative direction. Publishing uploads the image through LinkedIn's Images API and attaches its image URN to the post.

This integration publishes to a company Page, not the connected member's personal profile. Create a LinkedIn developer application with **Sign In with LinkedIn using OpenID Connect** and approved **Community Management API** access. The OAuth grant requests `w_organization_social`; the member connecting the app must be an `ADMINISTRATOR`, `DIRECT_SPONSORED_CONTENT_POSTER`, or `CONTENT_ADMIN` for the configured Page. An app that only exposes `w_member_social` cannot publish company-page posts.

Add this exact authorized redirect URL:

```text
https://thecuriousengineerblog.dev/author
```

Set these repository Actions variables:

| Variable | Value |
| --- | --- |
| `LINKEDIN_CLIENT_ID` | The developer application's client ID |
| `LINKEDIN_ORGANIZATION_ID` | The numeric ID from the company Page URL or LinkedIn organization lookup |
| `LINKEDIN_ORGANIZATION_NAME` | A display label used in the publishing confirmation |

Store only the client secret in AWS Secrets Manager as `curious-developer/linkedin-client-secret` (either plaintext or JSON with a `client_secret` key). The stack stores member access tokens in an encrypted DynamoDB table with TTL expiration; tokens and the client secret are never returned to the frontend or written to logs.

## Required setup

Store a fine-grained GitHub token in AWS Secrets Manager under `curious-developer/github-token`. "Plaintext" here means the secret value format; Secrets Manager still encrypts the secret at rest. The key/value editor is also supported when the key is exactly `token`. Limit the token to this repository with **Contents: read/write** and **Pull requests: read/write** permissions, set a short expiration, and rotate it. Never put the token in a command argument, documentation, source code, Lambda environment variable, or log output.

Configure these GitHub Actions secrets:

| Secret | Purpose |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | IAM role trusted by the repository's GitHub OIDC identity |
| `AWS_ACCOUNT_ID` | Target AWS account |
| `ACM_CERTIFICATE_ARN` | Existing `us-east-1` certificate for the site domain |
| `COGNITO_DOMAIN_PREFIX` | Globally unique Cognito hosted-login prefix |

Protect the `main` branch and require at least one approving review, dismissal of stale approvals, and passing build checks. Use `CODEOWNERS` to require trusted-maintainer review for workflow, infrastructure, and Lambda changes. Put deployment secrets and the deployment job behind a protected GitHub production environment. Do not give the author workflow permission to merge pull requests or deploy the stack.

## Add an author

After deploying `BlogStack`, find the Cognito user-pool ID:

```bash
aws cognito-idp list-user-pools \
  --max-results 20 \
  --query "UserPools[?contains(Name, 'AuthorUserPool')].[Name,Id]" \
  --output table
```

For a Cognito-native account, create the user first:

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <user-pool-id> \
  --username author@example.com \
  --user-attributes Name=email,Value=author@example.com
```

Do not set `email_verified=true` unless an administrator has independently verified that the intended author controls that address. Marking an address verified bypasses Cognito's normal ownership check.

For a Google-authenticated account, ask the user to sign in once before continuing. Cognito creates the federated user record during that first login.

List the users and copy the exact Cognito username. A Google user's Cognito username can differ from their email address.

```bash
aws cognito-idp list-users \
  --user-pool-id <user-pool-id> \
  --query "Users[*].[Username,Attributes[?Name=='email'].Value|[0]]" \
  --output table
```

Add the exact username to the `Authors` group:

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <user-pool-id> \
  --username '<exact-cognito-username>' \
  --group-name Authors
```

Verify the membership:

```bash
aws cognito-idp admin-list-groups-for-user \
  --user-pool-id <user-pool-id> \
  --username '<exact-cognito-username>'
```

The user must sign out and sign back in after being added. Their refreshed Cognito token will then contain the `Authors` group claim required by the publishing API.
