import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'; // SDK v3 ships inside the Node 24 runtime

const ssm = new SSMClient({}); // created outside the handler so warm invocations reuse it

export const handler = async (event) => {
  // Demo switch: start an execution with {"simulateFailure": true} to see retries and the catch path
  if (event && event.simulateFailure === true) {
    throw new Error('Simulated failure to demonstrate Step Functions retries and catch');
  }
  // The parameter name comes from an env var set by CDK, so it is never hardcoded here
  const parameterName = process.env.CONFIG_PARAMETER_NAME;
  if (!parameterName) {
    throw new Error('CONFIG_PARAMETER_NAME environment variable is not set'); // fail loudly on misconfiguration
  }
  const result = await ssm.send(new GetParameterCommand({ Name: parameterName, WithDecryption: false }));
  const greeting = result.Parameter?.Value; // ?. avoids a crash if Parameter is undefined
  console.log('Retrieved from SSM:', greeting); // this exact log line is your screenshot 3
  return { status: 'Success', parameterName, greeting };
};
