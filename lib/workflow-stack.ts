// lib/workflow-stack.ts
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

// Exported so the pipeline can scope its smoke-test IAM permissions to this exact name
export const STATE_MACHINE_NAME = 'CapstoneWorkflow';

export class WorkflowStack extends cdk.Stack {
  public readonly stateMachine: sfn.StateMachine;
  public readonly stateMachineArnOutput: cdk.CfnOutput; // lets the pipeline's smoke test find the ARN

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. The SSM parameter
    const configParam = new ssm.StringParameter(this, 'AppGreeting', {
      parameterName: '/app/config/greeting',
      stringValue: 'Hello from CI/CD Automated Infrastructure!',
      description: 'Greeting read by the workflow Lambda at runtime',
    });

    // Explicit log group so retention is bounded (the default is to keep logs forever)
    const taskLogGroup = new logs.LogGroup(this, 'WorkflowTaskLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // cleaned up on stack deletion, which suits a lab
    });

    // 2. The Lambda
    const workflowFn = new lambda.Function(this, 'WorkflowTask', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler', // file index.mjs, export handler
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda')), // path relative to this file, so it works from any directory
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: { CONFIG_PARAMETER_NAME: configParam.parameterName }, // single source of truth for the name
      logGroup: taskLogGroup,
    });
    configParam.grantRead(workflowFn); // generates a least-privilege IAM policy for this one parameter

    // 3. The workflow
    const prepare = new sfn.Pass(this, 'Prepare Input', {
      result: sfn.Result.fromObject({ requestedBy: 'capstone-4' }),
      resultPath: '$.meta', // adds to the input instead of replacing it, so simulateFailure survives
    });
    const pause = new sfn.Wait(this, 'Short Pause', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(2)),
    });
    const invoke = new tasks.LambdaInvoke(this, 'Fetch Config From SSM', {
      lambdaFunction: workflowFn,
      resultSelector: { 'payload.$': '$.Payload' }, // keeps only the function's return value
      resultPath: '$.taskResult',
    });
    invoke.addRetry({
      errors: ['States.TaskFailed'],
      interval: cdk.Duration.seconds(2),
      maxAttempts: 3,
      backoffRate: 2, // waits 2s, then 4s, then 8s
    });
    const failed = new sfn.Fail(this, 'Workflow Failed', {
      error: 'WorkflowError',
      cause: 'Lambda failed after all retries',
    });
    invoke.addCatch(failed, { errors: ['States.ALL'], resultPath: '$.error' }); // after retries run out, go to a clean Fail state

    const chain = prepare.next(pause).next(invoke).next(new sfn.Succeed(this, 'Workflow Succeeded'));

    const smLogGroup = new logs.LogGroup(this, 'StateMachineLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.stateMachine = new sfn.StateMachine(this, 'MyStateMachine', {
      stateMachineName: STATE_MACHINE_NAME,
      definitionBody: sfn.DefinitionBody.fromChainable(chain),
      timeout: cdk.Duration.minutes(5), // stops a stuck workflow from running indefinitely
      tracingEnabled: true,             // X-Ray tracing
      logs: { destination: smLogGroup, level: sfn.LogLevel.ALL },
    });

    this.stateMachineArnOutput = new cdk.CfnOutput(this, 'StateMachineArn', {
      value: this.stateMachine.stateMachineArn,
    });
  }
}
