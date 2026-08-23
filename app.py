#!/usr/bin/env python3
import os

import aws_cdk as cdk

from stacks.blog_stack import BlogStack
from stacks.budget_stack import BudgetStack
from stacks.llm_stack import LlmServiceStack

app = cdk.App()

aws_account = os.getenv("AWS_ACCOUNT_ID", os.getenv("CDK_DEFAULT_ACCOUNT"))
aws_region = os.getenv("AWS_REGION", os.getenv("CDK_DEFAULT_REGION", "us-east-1"))
email_address = os.getenv("EMAIL", os.getenv("CDK_DEFAULT_EMAIL"))

# Shared environment configuration
env_us_east_1 = cdk.Environment(
    account=aws_account,  # Your AWS Account ID
    region=aws_region     # Region hosting your Route 53 & ACM Certificate
)

# 1. BlogStack needs env specified because of route53.HostedZone.from_lookup
BlogStack(
    app,
    "BlogStack",
    env=env_us_east_1
)

# 2. BudgetStack
BudgetStack(
    app,
    "BlogBudgetStack",
    email_address=email_address,
    env=env_us_east_1
)

# 3. LlmServiceStack
LlmServiceStack(
    app,
    "LlmServiceStack",
    env=env_us_east_1
)

app.synth()