import aws_cdk as core
import aws_cdk.assertions as assertions

from stacks.blog_stack import AwscdkStack

# example tests. To run these tests, uncomment this file along with the example
# resource in stacks/blog_stack.py
def test_sqs_queue_created():
    app = core.App()
    stack = AwscdkStack(app, "stacks")
    template = assertions.Template.from_stack(stack)

#     template.has_resource_properties("AWS::SQS::Queue", {
#         "VisibilityTimeout": 300
#     })
