import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as opensearch from "aws-cdk-lib/aws-opensearchservice";
import * as iam from "aws-cdk-lib/aws-iam";

export class OpenSearchResource extends Construct {
  public readonly domainEndpoint: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

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
        masterUserName: process.env.OS_USER!,
        masterUserPassword: cdk.SecretValue.unsafePlainText(
          process.env.OS_PASS!
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

    this.domainEndpoint = domain.domainEndpoint;

    new cdk.CfnOutput(this, "OpenSearchEndpoint", {
      value: domain.domainEndpoint,
    });
  }
}
