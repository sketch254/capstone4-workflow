// test/workflow-stack.test.ts
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { WorkflowStack } from '../lib/workflow-stack';

describe('WorkflowStack', () => {
  const template = Template.fromStack(new WorkflowStack(new cdk.App(), 'TestStack'));

  test('creates the SSM parameter', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', { Name: '/app/config/greeting', Type: 'String' });
  });

  test('Lambda can read the parameter and gets its name via env var', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Action: Match.arrayWith(['ssm:GetParameter']), Effect: 'Allow' })]) },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: { CONFIG_PARAMETER_NAME: Match.anyValue() } },
    });
  });

  test('state machine has Pass, Wait, Task, retry and catch', () => {
    const sms = template.findResources('AWS::StepFunctions::StateMachine');
    // The definition is a token-laden string, so I search the serialized text for each state type
    const def = JSON.stringify(Object.values(sms)[0].Properties.DefinitionString);
    for (const needle of ['"Type":"Pass"', '"Type":"Wait"', '"Type":"Task"', 'Retry', 'Catch']) {
      expect(def).toContain(needle.replace(/\\"/g, '"').replace(/"/g, '\\"'));
    }
  });
});
