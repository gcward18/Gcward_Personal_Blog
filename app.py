#!/usr/bin/env python3
import os

import aws_cdk as cdk

from awscdk.awscdk_stack import AwscdkStack
from awscdk.budget_stack import BudgetStack
from awscdk.llm_stack import LlmServiceStack

app = cdk.App()
AwscdkStack(app, "AwscdkStack")
BudgetStack(
    app, "BlogBudgetStack",
    email_address="gcward18@gmail.com",  # Replace with your email
    env=cdk.Environment(account="211663170976", region="us-east-1")
)
LlmServiceStack(
    app, "LlmServiceStack",
)
app.synth()
