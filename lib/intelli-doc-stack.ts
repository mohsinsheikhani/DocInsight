import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as opensearch from "aws-cdk-lib/aws-opensearchservice";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";

export class IntelliDocStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "DocumentBucket", {
      bucketName: "intellidocstack-documentbucket",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: true,
    });

    const nodeJsFunctionProps: NodejsFunctionProps = {
      functionName: "DocProcessorLambda",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      memorySize: 1024,
      entry: path.join(__dirname, "../lambda/index.js"),
      timeout: cdk.Duration.seconds(300),
      environment: {
        S3_BUCKET_NAME: bucket.bucketName,
      },
    };

    const docProcessorLambda = new NodejsFunction(this, "DocProcessorLambda", {
      ...nodeJsFunctionProps,
    });

    docProcessorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:PutObject"],
        resources: [`${bucket.bucketArn}/*`],
      })
    );

    docProcessorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "textract:StartDocumentTextDetection",
          "textract:GetDocumentTextDetection",
          "bedrock:InvokeModel",
        ],
        resources: ["*"],
      })
    );

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(docProcessorLambda)
    );

    const domain = new opensearch.Domain(this, "MyOpenSearchDomain", {
      version: opensearch.EngineVersion.OPENSEARCH_2_11,
      domainName: "intellidoc-test",

      capacity: {
        dataNodes: 1,
        multiAzWithStandbyEnabled: false,
        dataNodeInstanceType: "m5.large.search",
      },

      ebs: {
        volumeSize: 10,
      },

      nodeToNodeEncryption: true,
      encryptionAtRest: {
        enabled: true,
      },

      enforceHttps: true,

      fineGrainedAccessControl: {
        masterUserName: "admin",
        masterUserPassword: cdk.SecretValue.unsafePlainText(
          "YourSecurePassword123!"
        ),
      },

      removalPolicy: cdk.RemovalPolicy.DESTROY,

      zoneAwareness: {
        enabled: false,
        // availabilityZoneCount: 3,
      },

      accessPolicies: [
        new iam.PolicyStatement({
          actions: ["es:*"],
          effect: iam.Effect.ALLOW,
          principals: [new iam.AnyPrincipal()],
          resources: ["*"],
        }),
      ],
    });

    const qaFunctionProps: NodejsFunctionProps = {
      functionName: "QuestionAnswerLambda",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      memorySize: 1024,
      entry: path.join(__dirname, "../lambda/qa.js"),
      timeout: cdk.Duration.seconds(300),
      environment: {
        OPENSEARCH_ENDPOINT: domain.domainEndpoint,
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

    new cdk.CfnOutput(this, "OpenSearchEndpoint", {
      value: domain.domainEndpoint,
    });
    new cdk.CfnOutput(this, "QnAApiEndpoint", {
      value: `https://${api.restApiId}.execute-api.${
        cdk.Stack.of(this).region
      }.amazonaws.com/${api.deploymentStage.stageName}/ask`,
    });
  }
}
