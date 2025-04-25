import { Construct } from "constructs";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";

import * as path from "path";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";

interface Props {
  domainEndpoint: string;
}

export class DocumentProcessingResource extends Construct {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const bucket = new s3.Bucket(this, "DocumentBucket", {
      bucketName: "intellidocstack-documentbucket",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: true,
      eventBridgeEnabled: true,
    });

    // Api Gateway resoruce for /upload endpoint
    const apiResource = new apigateway.RestApi(this, "DocumentUploadApi", {
      restApiName: "Document Upload Service",
      binaryMediaTypes: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream",
      ],
    });

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

    /*********
     * Step Function
     ********/

    // StartTextractJobLambda
    const startTextractJobLambdaProps: NodejsFunctionProps = {
      functionName: "StartTextractJobLambda",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(__dirname, "../../lambda/start-textract/index.js"),
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
      entry: path.join(__dirname, "../../lambda/poll-textract/index.js"),
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
      entry: path.join(__dirname, "../../lambda/extract-chunk-text/index.js"),
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
        "../../lambda/generate-store-embeddings/index.js"
      ),
      environment: {
        OPENSEARCH_ENDPOINT: `https://${props.domainEndpoint}`,
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

    stepFunction.grantStartExecution(
      new iam.ServicePrincipal("events.amazonaws.com")
    );

    const dlq = new sqs.Queue(this, "EventBridgeDLQ", {
      queueName: "eventbridge-sf-dlq-intellidoc",
    });

    dlq.grantSendMessages(new iam.ServicePrincipal("events.amazonaws.com"));

    new events.Rule(this, "S3PutObjectRule", {
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: {
          bucket: { name: [bucket.bucketName] },
          object: { key: [{ prefix: "" }] },
        },
      },
      targets: [
        new targets.SfnStateMachine(stepFunction, {
          deadLetterQueue: dlq,
          input: events.RuleTargetInput.fromObject({
            bucketName: bucket.bucketName,
            documentKey: events.EventField.fromPath("$.detail.object.key"),
            eventTime: events.EventField.fromPath("$.time"),
          }),
        }),
      ],
    });

    new cdk.CfnOutput(this, "UploadApiEndpoint", {
      value: `https://${apiResource.restApiId}.execute-api.${
        cdk.Stack.of(this).region
      }.amazonaws.com/${apiResource.deploymentStage.stageName}/upload`,
    });
  }
}
