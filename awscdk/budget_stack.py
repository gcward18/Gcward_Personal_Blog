import aws_cdk as cdk
from aws_cdk import (
    Stack,
    aws_budgets as budgets,
)
from constructs import Construct

class BudgetStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, email_address: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        budgets.CfnBudget(
            self, "MonthlyCostBudget",
            budget=budgets.CfnBudget.BudgetDataProperty(
                budget_name="BlogMonthlyBudget",
                budget_type="COST",
                time_unit="MONTHLY",
                budget_limit=budgets.CfnBudget.SpendProperty(
                    amount=1,      # Threshold limit ($1)
                    unit="USD"
                )
            ),
            notifications_with_subscribers=[
                # Warning Notification at 80% ($0.80)
                budgets.CfnBudget.NotificationWithSubscribersProperty(
                    notification=budgets.CfnBudget.NotificationProperty(
                        comparison_operator="GREATER_THAN",
                        notification_type="ACTUAL",
                        threshold=80,
                        threshold_type="PERCENTAGE"
                    ),
                    subscribers=[
                        budgets.CfnBudget.SubscriberProperty(
                            address=email_address,
                            subscription_type="EMAIL"
                        )
                    ]
                ),
                # Critical Notification at 100% ($1.00)
                budgets.CfnBudget.NotificationWithSubscribersProperty(
                    notification=budgets.CfnBudget.NotificationProperty(
                        comparison_operator="GREATER_THAN",
                        notification_type="ACTUAL",
                        threshold=100,
                        threshold_type="PERCENTAGE"
                    ),
                    subscribers=[
                        budgets.CfnBudget.SubscriberProperty(
                            address=email_address,
                            subscription_type="EMAIL"
                        )
                    ]
                ),
            ]
        )