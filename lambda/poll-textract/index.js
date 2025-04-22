import {
  TextractClient,
  GetDocumentTextDetectionCommand,
} from "@aws-sdk/client-textract";

const textractClient = new TextractClient({ region: "us-east-1" });

exports.handler = async (event) => {
  const { jobId } = event;

  console.log("Checking Textract Job Status for Job ID:", jobId);

  try {
    const result = await textractClient.send(
      new GetDocumentTextDetectionCommand({ JobId: jobId })
    );

    const jobStatus = result.JobStatus;

    console.log(`Textract Job Status: ${jobStatus}`);

    return {
      jobStatus,
      jobId,
    };
  } catch (error) {
    console.error("Error checking Textract Job Status:", error);
    throw error;
  }
};
