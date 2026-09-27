"""Synthesize offline: reuse the built frontend and avoid Route 53 lookups."""
import os
import tempfile
import unittest
from unittest.mock import patch
import aws_cdk as cdk
from aws_cdk import assertions, aws_route53 as route53
from stacks.blog_stack import BlogStack


class CompanionInfrastructureTests(unittest.TestCase):
    def test_mobile_client_and_existing_authorization(self):
        with tempfile.TemporaryDirectory() as output, patch.dict(os.environ, {
            'ACM_CERTIFICATE_ARN': 'arn:aws:acm:us-east-1:111111111111:certificate/test',
            'DOMAIN_NAME': 'example.com',
        }), patch('stacks.blog_stack.subprocess.run'), patch.object(
            route53.HostedZone, 'from_lookup', side_effect=lambda scope, identifier, **kwargs:
                route53.HostedZone.from_hosted_zone_attributes(scope, identifier, hosted_zone_id='ZTEST', zone_name='example.com')
        ):
            app = cdk.App(outdir=output)
            stack = BlogStack(app, 'TestBlog', env=cdk.Environment(account='111111111111', region='us-east-1'))
            template = assertions.Template.from_stack(stack)
            template.has_resource_properties('AWS::Cognito::UserPoolClient', {
                'GenerateSecret': False,
                'AllowedOAuthFlows': ['code'],
                'CallbackURLs': ['curiousengineer://oauth/callback'],
            })
            template.has_resource_properties('AWS::ApiGateway::Method', {
                'HttpMethod': 'POST', 'AuthorizationType': 'COGNITO_USER_POOLS',
            })
            resources = template.to_json()['Resources']
            self.assertIn('mobileClientId', str(resources))
            self.assertIn('tokenUrl', str(resources))
