import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import "dotenv/config";

import { OpenSearchResource } from "./constructs/opensearch";
import { DocumentProcessingResource } from "./constructs/document-processing";
import { NLQApiResource } from "./constructs/nlq-api";

export class IntelliDocStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const opensearch = new OpenSearchResource(this, "MyOpenSearchDomain");

    new DocumentProcessingResource(this, "DocumentProcessing", {
      domainEndpoint: opensearch.domainEndpoint,
    });

    new NLQApiResource(this, "NLQApiResource", {
      domainEndpoint: opensearch.domainEndpoint,
    });
  }
}
