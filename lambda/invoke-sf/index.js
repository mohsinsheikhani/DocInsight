const { SFNClient, StartExecutionCommand } = require("@aws-sdk/client-sfn");

const sfnClient = new SFNClient({ region: "us-east-1" });

export const handler = async (event) => {
  console.log("S3 Event:", JSON.stringify(event));

  const record = event.Records?.[0];
  const bucketName = record.s3.bucket.name;
  const documentKey = decodeURIComponent(
    record.s3.object.key.replace(/\+/g, " ")
  );

  const input = JSON.stringify({ bucketName, documentKey });

  const command = new StartExecutionCommand({
    stateMachineArn: process.env.STATE_MACHINE_ARN,
    input,
  });

  try {
    const response = await sfnClient.send(command);
    console.log("Step Function started:", response);
  } catch (err) {
    console.error("Error starting Step Function:", err);
    throw err;
  }
};
