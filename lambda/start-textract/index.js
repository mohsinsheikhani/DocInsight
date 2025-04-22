import {
  TextractClient,
  StartDocumentTextDetectionCommand,
} from "@aws-sdk/client-textract";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

const textractClient = new TextractClient({
  region: "us-east-1",
  credentials: fromNodeProviderChain(),
});

export const handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  const { bucketName, documentKey } = event;

  if (!bucketName || !documentKey) {
    throw new Error("Missing required parameters: bucketName or documentKey");
  }

  try {
    const command = new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: { Bucket: bucketName, Name: documentKey },
      },
    });

    const response = await textractClient.send(command);

    console.log("Textract start response:", response);

    return {
      jobId: response.JobId,
      bucketName,
      documentKey,
    };
  } catch (error) {
    console.error("Failed to start Textract job:", error);
    throw error;
  }
};
