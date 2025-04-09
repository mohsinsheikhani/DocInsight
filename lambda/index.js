import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
} from "@aws-sdk/client-textract";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

const textractClient = new TextractClient({
  region: "us-east-1",
  credentials: fromNodeProviderChain(),
});
const s3Client = new S3Client({
  region: "us-east-1",
  credentials: fromNodeProviderChain(),
});

export const handler = async (event) => {
  console.log("Event:", JSON.stringify(event, null, 2));

  const record = event.Records[0];

  const bucketName = record.s3.bucket.name;
  const documentKey = record.s3.object.key;

  console.log(`Processing document: ${documentKey} from bucket: ${bucketName}`);

  try {
    // Start Textract Text Extraction Job
    const startResponse = await textractClient.send(
      new StartDocumentTextDetectionCommand({
        DocumentLocation: {
          S3Object: { Bucket: bucketName, Name: documentKey },
        },
      })
    );

    const jobId = startResponse.JobId;
    console.log(`Textract Job Started: ${jobId}`);

    // Wait and Poll for Textract Results
    let jobStatus = "IN_PROGRESS";
    let response;
    while (jobStatus === "IN_PROGRESS") {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      response = await textractClient.send(
        new GetDocumentTextDetectionCommand({ JobId: jobId })
      );
      jobStatus = response.JobStatus;
      console.log(`Textract Job Status: ${jobStatus}`);
    }

    if (jobStatus === "SUCCEEDED") {
      const extractedText = response.Blocks.filter(
        (block) => block.BlockType === "LINE"
      )
        .map((block) => block.Text)
        .join("\n");

      console.log("Extracted Text:", extractedText);
    } else {
      console.error("Textract Job Failed:", response);
    }
  } catch (error) {
    console.error("Error processing document:", error);
  }
};
