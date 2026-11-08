// test/workflow-stack.test.ts
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { WorkflowStack } from '../lib/workflow-stack';

describe('WorkflowStack', () => {
  const template = Template.fromStack(new WorkflowStack(new cdk.App(), 'TestStack'));

  test('creates the SSM parameter', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/app/config/greeting',
      Type: 'String',
    });
  });

  test('Lambda can read the parameter and gets its name via env var', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['ssm:GetParameter']),
            Effect: 'Allow',
          }),
        ]),
      },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: { CONFIG_PARAMETER_NAME: Match.anyValue() },
      },
    });
  });

  test('state machine has Pass, Wait, Task, retry and catch', () => {
    const sms = template.findResources('AWS::StepFunctions::StateMachine');
    const properties = Object.values(sms)[0].Properties;

    // CDK may synthesise the definition in several ways:
    // 1. As an inline object in Properties.Definition
    // 2. As a JSON string in Properties.DefinitionString
    // 3. As a CloudFormation intrinsic (Fn::Join) when tokens are present
    let definition: any = properties.Definition ?? properties.DefinitionString;

    // Resolve Fn::Join["", [...]] by concatenating the array of string fragments
    if (definition && typeof definition === 'object' && 'Fn::Join' in definition) {
      const joinParts: string[] = definition['Fn::Join'][1];
      definition = JSON.parse(joinParts.join(''));
    } else if (typeof definition === 'string') {
      definition = JSON.parse(definition);
    }

    const defStr = JSON.stringify(definition);

    expect(defStr).toContain('"Type":"Pass"');
    expect(defStr).toContain('"Type":"Wait"');
    expect(defStr).toContain('"Type":"Task"');
    expect(defStr).toContain('Retry');
    expect(defStr).toContain('Catch');
  });
});
