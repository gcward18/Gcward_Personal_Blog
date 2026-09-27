"""No AWS credentials, network requests or model invocations required."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch


class CompanionAssistantTests(unittest.TestCase):
    def setUp(self):
        self.client = MagicMock()
        spec = importlib.util.spec_from_file_location('companion_assistant', Path(__file__).parents[2] / 'lambda/assistant/index.py')
        self.module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'boto3': MagicMock(client=MagicMock(return_value=self.client))}):
            spec.loader.exec_module(self.module)
        self.env = patch.dict('os.environ', {'ALLOWED_ORIGINS': 'https://example.com'})
        self.env.start()
        self.addCleanup(self.env.stop)

    def invoke(self, body, group='Authors'):
        return self.module.handler({'requestContext': {'authorizer': {'claims': {'cognito:groups': group}}}, 'body': json.dumps(body)}, None)

    def test_ask_is_read_only_and_uses_article(self):
        self.client.converse.return_value = {'output': {'message': {'content': [{'text': json.dumps({'feedback': 'An answer', 'markdown': 'changed text', 'changed': True})}]}}}
        result = self.invoke({'mode': 'ask', 'instruction': 'Explain', 'article': 'Canonical article'})
        self.assertEqual(result['statusCode'], 200)
        self.assertEqual(json.loads(result['body']), {'feedback': 'An answer', 'changed': False})
        self.assertIn('Canonical article', self.client.converse.call_args.kwargs['messages'][-1]['content'][0]['text'])

    def test_non_author_cannot_invoke_bedrock(self):
        self.assertEqual(self.invoke({'mode': 'ask', 'instruction': 'Explain', 'article': 'text'}, '')['statusCode'], 403)
        self.client.converse.assert_not_called()

    def test_invalid_context_and_history(self):
        for body in [{'article': ''}, {'article': 'text', 'messages': 'bad'}, {'article': 'text', 'messages': [None]}]:
            self.assertEqual(self.invoke({'mode': 'ask', 'instruction': 'Explain', **body})['statusCode'], 400)
        self.client.converse.assert_not_called()

    def test_model_failure_is_recoverable(self):
        self.client.converse.side_effect = RuntimeError('offline')
        self.assertEqual(self.invoke({'mode': 'ask', 'instruction': 'Explain', 'article': 'text'})['statusCode'], 502)

    def test_editor_mode_still_returns_revisions(self):
        self.client.converse.return_value = {'output': {'message': {'content': [{'text': '{"feedback":"Revised","markdown":"new","changed":true}'}]}}}
        result = self.invoke({'instruction': 'Revise', 'article': 'old'})
        self.assertTrue(json.loads(result['body'])['changed'])
