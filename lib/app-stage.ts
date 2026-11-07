// lib/app-stage.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { WorkflowStack } from './workflow-stack';

// A Stage is the unit a pipeline deploys. Add more Stage instances (dev, prod) here for more environments.
export class AppStage extends cdk.Stage {
  public readonly stateMachineArnOutput: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);
    const workflow = new WorkflowStack(this, 'WorkflowStack');
    this.stateMachineArnOutput = workflow.stateMachineArnOutput; // re-exposed so the pipeline can read it
  }
}
