// lib/pipeline-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { AppStage } from './app-stage';
import { STATE_MACHINE_NAME } from './workflow-stack';

export interface PipelineStackProps extends cdk.StackProps {
  readonly githubRepo: string;
  readonly githubBranch: string;
  readonly connectionArn: string;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    // Source: GitHub through an AWS CodeConnections connection
    const source = pipelines.CodePipelineSource.connection(props.githubRepo, props.githubBranch, {
      connectionArn: props.connectionArn,
    });

    const pipeline = new pipelines.CodePipeline(this, 'Pipeline', {
      pipelineName: 'CapstoneWorkflowPipeline',
      pipelineType: codepipeline.PipelineType.V2, // avoids the V1 default warning
      synth: new pipelines.ShellStep('Synth', {
        input: source,
        // npm ci needs a committed package-lock.json. build type-checks, test runs Jest, synth makes the templates.
        commands: ['npm ci', 'npm run build', 'npm test', 'npx cdk synth'],
      }),
    });

    const prod = new AppStage(this, 'Prod', { env: props.env });

    // Post-deploy check: run the workflow and fail the pipeline if it does not succeed
    const smokeTest = new pipelines.CodeBuildStep('SmokeTest', {
      envFromCfnOutputs: { STATE_MACHINE_ARN: prod.stateMachineArnOutput }, // injects the ARN as an env var
      commands: [
        'EXEC=$(aws stepfunctions start-execution --state-machine-arn "$STATE_MACHINE_ARN" --query executionArn --output text)',
        // Poll up to 20 times, 3s apart: exit 0 on SUCCEEDED, exit 1 on any non-RUNNING status, exit 1 on timeout
        'for i in $(seq 1 20); do STATUS=$(aws stepfunctions describe-execution --execution-arn "$EXEC" --query status --output text); echo "Status: $STATUS"; if [ "$STATUS" = "SUCCEEDED" ]; then exit 0; fi; if [ "$STATUS" != "RUNNING" ]; then exit 1; fi; sleep 3; done; exit 1',
      ],
      // Least privilege: only this state machine and its executions
      rolePolicyStatements: [
        new iam.PolicyStatement({
          actions: ['states:StartExecution'],
          resources: [this.formatArn({ service: 'states', resource: 'stateMachine', resourceName: STATE_MACHINE_NAME, arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME })],
        }),
        new iam.PolicyStatement({
          actions: ['states:DescribeExecution'],
          resources: [this.formatArn({ service: 'states', resource: 'execution', resourceName: `${STATE_MACHINE_NAME}:*`, arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME })],
        }),
      ],
    });

    pipeline.addStage(prod, { post: [smokeTest] });
  }
}
