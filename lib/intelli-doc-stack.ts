import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";

export class IntelliDocStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "DocumentBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const nodeJsFunctionProps: NodejsFunctionProps = {
      functionName: "DocProcessorLambda",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(__dirname, "../lambda/index.js"),
      timeout: cdk.Duration.seconds(30),
      environment: {
        S3_BUCKET_NAME: bucket.bucketName,
      },
    };

    const docProcessorLambda = new NodejsFunction(this, "DocProcessorLambda", {
      ...nodeJsFunctionProps,
    });

    docProcessorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`${bucket.bucketArn}/*`],
      })
    );

    docProcessorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "textract:StartDocumentTextDetection",
          "textract:GetDocumentTextDetection",
        ],
        resources: ["*"],
      })
    );

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(docProcessorLambda)
    );
  }
}
