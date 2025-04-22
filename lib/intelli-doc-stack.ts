import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import * as opensearch from "aws-cdk-lib/aws-opensearchservice";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";

export class IntelliDocStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "DocumentBucket", {
      bucketName: "intellidocstack-documentbucket",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: true,
    });

    // REST API Gateway
    const apiResource = new apigateway.RestApi(this, "DocumentUploadApi", {
      restApiName: "Document Upload Service",
      binaryMediaTypes: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream",
      ],
    });

    // IAM role for API Gateway to access S3
    const apiGatewayS3Role = new iam.Role(this, "ApiGatewayS3Role", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    });

    bucket.grantPut(apiGatewayS3Role);

    const uploadResource = apiResource.root.addResource("upload");

    uploadResource.addMethod(
      "POST",
      new apigateway.AwsIntegration({
        service: "s3",
        integrationHttpMethod: "PUT",
        path: `${bucket.bucketName}/{object}`,
        options: {
          credentialsRole: apiGatewayS3Role,
          requestParameters: {
            "integration.request.path.object":
              "method.request.querystring.filename",
            "integration.request.header.Content-Type":
              "method.request.header.Content-Type",
          },
          passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
          integrationResponses: [
            {
              statusCode: "200",
              responseTemplates: {
                "application/json": JSON.stringify({
                  message: "Upload success!",
                }),
              },
            },
          ],
        },
      }),
      {
        requestParameters: {
          "method.request.querystring.filename": true,
          "method.request.header.Content-Type": true,
        },
        methodResponses: [
          {
            statusCode: "200",
          },
        ],
      }
    );

    // StartTextractJobLambda
    const startTextractJobLambdaProps: NodejsFunctionProps = {
      functionName: "StartTextractJobLambda",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(__dirname, "../lambda/start-textract/index.js"),
    };

    const startTextractJobLambda = new NodejsFunction(
      this,
      "StartTextractJobLambda",
      {
        ...startTextractJobLambdaProps,
      }
    );

    startTextractJobLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`${bucket.bucketArn}/*`],
      })
    );

    startTextractJobLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["textract:StartDocumentTextDetection"],
        resources: ["*"],
      })
    );

    const startTextractJobTask = new tasks.LambdaInvoke(
      this,
      "Start Textract Job",
      {
        lambdaFunction: startTextractJobLambda,
        outputPath: "$.Payload",
      }
    );

    // PollTextractLambda
    const pollTextractLambdaProps: NodejsFunctionProps = {
      functionName: "PollTextractLambda",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(__dirname, "../lambda/poll-textract/index.js"),
    };

    const pollTextractLambda = new NodejsFunction(this, "PollTextractLambda", {
      ...pollTextractLambdaProps,
    });

    pollTextractLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["textract:GetDocumentTextDetection"],
        resources: ["*"],
      })
    );

    const checkStatus = new tasks.LambdaInvoke(
      this,
      "Check Textract Job Status",
      {
        lambdaFunction: pollTextractLambda,
        resultPath: "$.textractStatus",
        inputPath: "$",
      }
    );

    // ExtractAndChunkText
    const extractAndChunkLambdaProps: NodejsFunctionProps = {
      functionName: "ExtractAndChunkText",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(__dirname, "../lambda/extract-chunk-text/index.js"),
    };

    const extractAndChunkLambda = new NodejsFunction(
      this,
      "ExtractAndChunkText",
      {
        ...extractAndChunkLambdaProps,
      }
    );

    extractAndChunkLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["textract:GetDocumentTextDetection"],
        resources: ["*"],
      })
    );

    const extractAndChunkText = new tasks.LambdaInvoke(
      this,
      "Extract and Chunk Text",
      {
        lambdaFunction: extractAndChunkLambda,
        resultPath: "$.chunkedText",
      }
    );

    // GenerateEmbeddings
    const generateEmbeddingsProps: NodejsFunctionProps = {
      functionName: "GenerateAndStoreEmbeddings",
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      handler: "handler",
      entry: path.join(
        __dirname,
        "../lambda/generate-store-embeddings/index.js"
      ),
      environment: {
        OPENSEARCH_ENDPOINT: process.env.OPENSEARCH_ENDPOINT!,
        OS_USER: process.env.OS_USER!,
        OS_PASS: process.env.OS_PASS!,
      },
    };

    const generateAndStoreEmbeddingsLambda = new NodejsFunction(
      this,
      "GenerateAndStoreEmbeddings",
      {
        ...generateEmbeddingsProps,
      }
    );

    generateAndStoreEmbeddingsLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    const generateEmbeddingsMap = new sfn.Map(this, "Generate Embeddings Map", {
      itemsPath: "$.chunkedText.Payload.chunks",
      resultPath: "$.embeddings",
      parameters: {
        chunk: sfn.JsonPath.stringAt("$$.Map.Item.Value"),
        documentKey: sfn.JsonPath.stringAt("$.documentKey"),
        index: sfn.JsonPath.stringAt("$$.Map.Item.Index"),
      },
    });

    generateEmbeddingsMap.itemProcessor(
      new tasks.LambdaInvoke(this, "Generate And Store Embeddings", {
        lambdaFunction: generateAndStoreEmbeddingsLambda,
        inputPath: "$",
        resultPath: "$",
      })
    );

    // Step Function Specifics
    const jobFailed = new sfn.Fail(this, "Textract Failed", {
      error: "Textract Job Failed",
      cause: "Textract processing did not succeed",
    });

    const waitForTextract = new sfn.Wait(this, "Wait for Textract", {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(10)),
    });

    const isJobComplete = new sfn.Choice(this, "Is Job Complete?")
      .when(
        sfn.Condition.stringEquals(
          "$.textractStatus.Payload.jobStatus",
          "SUCCEEDED"
        ),
        extractAndChunkText.next(generateEmbeddingsMap)
      )
      .when(
        sfn.Condition.stringEquals(
          "$.textractStatus.Payload.jobStatus",
          "FAILED"
        ),
        jobFailed
      )
      .otherwise(waitForTextract.next(checkStatus));

    const definition = startTextractJobTask
      .next(checkStatus)
      .next(isJobComplete);

    const stepFunction = new sfn.StateMachine(this, "IntelliDocStateMachine", {
      definition,
    });

    const startWorkflowLambdaProps: NodejsFunctionProps = {
      functionName: "StartWorkflowLambda",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(__dirname, "../lambda/invoke-sf/index.js"),
      environment: {
        STATE_MACHINE_ARN: stepFunction.stateMachineArn,
      },
    };

    const startWorkflowLambda = new NodejsFunction(
      this,
      "StartWorkflowLambda",
      {
        ...startWorkflowLambdaProps,
      }
    );

    stepFunction.grantStartExecution(startWorkflowLambda);

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED_PUT,
      new s3n.LambdaDestination(startWorkflowLambda)
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

    new cdk.CfnOutput(this, "UploadApiEndpoint", {
      value: `https://${apiResource.restApiId}.execute-api.${
        cdk.Stack.of(this).region
      }.amazonaws.com/${apiResource.deploymentStage.stageName}/upload`,
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
