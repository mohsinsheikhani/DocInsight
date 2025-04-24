import { Construct } from "constructs";
import * as path from "path";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigateway from "aws-cdk-lib/aws-apigateway";

import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";

interface Props {
  domainEndpoint: string;
}

export class NLQApiResource extends Construct {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    // Lambda for QA Processing
    const qaFunctionProps: NodejsFunctionProps = {
      functionName: "QuestionAnswerLambda",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      memorySize: 256,
      entry: path.join(__dirname, "../../lambda/nlq-processor/index.js"),
      timeout: cdk.Duration.seconds(20),
      environment: {
        OPENSEARCH_ENDPOINT: `https://${props.domainEndpoint}`,
        OS_USER: process.env.OS_USER!,
        OS_PASS: process.env.OS_PASS!,
      },
    };

    const qaLambda = new NodejsFunction(this, "QuestionAnswerLambda", {
      ...qaFunctionProps,
    });

    qaLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    // Api Gateway resource for /api endpoint
    const api = new apigateway.RestApi(this, "QnAApi", {
      restApiName: "IntelliDoc Q&A API",
      description: "API for asking document-related questions.",
      deployOptions: {
        stageName: "prod",
      },
    });

    const askResource = api.root.addResource("ask");

    askResource.addMethod("POST", new apigateway.LambdaIntegration(qaLambda), {
      apiKeyRequired: false,
    });

    new cdk.CfnOutput(this, "QnAApiEndpoint", {
      value: `https://${api.restApiId}.execute-api.${
        cdk.Stack.of(this).region
      }.amazonaws.com/${api.deploymentStage.stageName}/ask`,
    });
  }
}
