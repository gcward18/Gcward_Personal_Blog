# Deployment Pipeline

The Curious Engineer blog uses a review-gated GitHub Actions pipeline:

```text
Author submission
  -> GitHub pull request
  -> Reviewer approval
  -> Merge into main
  -> GitHub Actions
  -> Vite production build
  -> CDK deployment
  -> S3 upload
  -> CloudFront invalidation
```

The workflow definition is `../.github/workflows/deploy-blog.yml`. It runs after relevant changes are merged into `main` and can also be started manually.

## 1. Bootstrap the AWS account

Run this once locally:

```bash
cdk bootstrap aws://<AWS_ACCOUNT_ID>/us-east-1
```

CDK bootstrap creates the AWS deployment and asset-publishing roles used by the pipeline.

## 2. Create a GitHub OIDC deployment role

Create an IAM role using the **Web identity** trusted-entity type:

| Setting | Value |
| --- | --- |
| Identity provider | `token.actions.githubusercontent.com` |
| Audience | `sts.amazonaws.com` |
| GitHub organization | `gcward18` |
| Repository | `Gcward_Personal_Blog` |
| Branch | `main` |

The role trust policy should resemble:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:gcward18/Gcward_Personal_Blog:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

Grant this role only the permissions required by the stacks in this repository. Scope `sts:AssumeRole` to the exact CDK bootstrap role ARNs for this account, region, and bootstrap qualifier; do not grant access to `cdk-*` roles with an unrestricted wildcard. Keep the trust policy restricted to this repository and `main` branch as shown above, and do not store permanent AWS access keys in GitHub.

## 3. Configure GitHub Actions secrets

Open **GitHub repository -> Settings -> Secrets and variables -> Actions** and add:

| Secret | Purpose |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | ARN of the GitHub OIDC deployment role |
| `AWS_ACCOUNT_ID` | Target AWS account ID |
| `ACM_CERTIFICATE_ARN` | Existing ACM certificate ARN from `us-east-1` |
| `COGNITO_DOMAIN_PREFIX` | Globally unique prefix such as `curious-developer-gcward18` |

Store these values in a protected GitHub **production environment**, restrict that environment to the `main` branch, and require reviewer approval for deployments. Configure the workflow job to use that environment. Repository administrators should not bypass the protection rule except through an audited emergency process.

The GitHub publishing token belongs in AWS Secrets Manager rather than GitHub Actions:

```bash
aws secretsmanager describe-secret \
  --secret-id curious-developer/github-token
```

The fine-grained GitHub token needs access only to this repository, with **Contents: read/write** and **Pull requests: read/write** permissions. Give it the shortest practical expiration, rotate it before expiry, and revoke it immediately if it may have been exposed. Never place the token in documentation, shell history, source code, Lambda environment variables, or workflow logs.

## 4. Protect the main branch

Under **GitHub repository -> Settings -> Branches**, create a protection rule for `main`:

- Require a pull request before merging.
- Require at least one approving review.
- Dismiss stale approvals when new commits are pushed.
- Require status checks, including the frontend build, before merging.
- Block force pushes.
- Prevent authors from bypassing review.

This protection is the approval boundary between an author draft and a published article.

Also protect workflow files and infrastructure code with `CODEOWNERS`, and require review from a trusted maintainer for changes to `.github/workflows/**`, `stacks/**`, `lambda/**`, and `app.py`. A content pull request must not be able to modify its own deployment permissions.

## 5. Test the pipeline

Trigger the workflow manually from:

**GitHub -> Actions -> Deploy Curious Engineer Blog -> Run workflow**

Alternatively, merge an approved article pull request into `main`. The workflow will:

1. Install the locked Python and Node.js dependencies.
2. Compile the Vite frontend.
3. Synthesize and deploy `BlogStack`.
4. Upload only the generated `../frontend/dist` files to S3.
5. Invalidate CloudFront so the approved article becomes available.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| GitHub cannot obtain AWS credentials | Confirm the OIDC role ARN, repository name, branch condition, and `id-token: write` workflow permission. |
| CDK reports that the environment is not bootstrapped | Run `cdk bootstrap` for the exact account and region. |
| CDK cannot assume a bootstrap role | Add `sts:AssumeRole` only for the exact bootstrap role ARN named in the error, after verifying its account, region, qualifier, and purpose. Do not use an unrestricted `cdk-*` wildcard. |
| The certificate cannot be found | Confirm `ACM_CERTIFICATE_ARN` references a certificate in `us-east-1`. |
| Author submissions cannot create a pull request | Verify the AWS Secrets Manager token and its GitHub repository permissions. |
| Deployment succeeds but old content remains | Check the `BucketDeployment` CloudFront invalidation and verify the workflow deployed `BlogStack`. |
