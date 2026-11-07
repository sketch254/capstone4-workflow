import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

new PipelineStack(app, 'CapstonePipelineStack', {
  // Uses the account and region from your AWS CLI profile at deploy time
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  githubRepo: app.node.getContext('githubRepo'),       // reads cdk.json, so nothing is hardcoded here
  githubBranch: app.node.getContext('githubBranch'),
  connectionArn: app.node.getContext('connectionArn'),
});
