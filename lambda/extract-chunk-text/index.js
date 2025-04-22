import {
  TextractClient,
  GetDocumentTextDetectionCommand,
} from "@aws-sdk/client-textract";

const textractClient = new TextractClient({ region: "us-east-1" });

export const handler = async (event) => {
  const { jobId } = event;

  try {
    const response = await textractClient.send(
      new GetDocumentTextDetectionCommand({ JobId: jobId })
    );

    // Extract all text
    const extractedText = response.Blocks.filter(
      (block) => block.BlockType === "LINE"
    )
      .map((block) => block.Text)
      .join("\n");

    const chunks = chunkTextByWords(extractedText);

    return {
      chunks,
    };
  } catch (error) {
    console.error("Error processing document:", error);
  }
};

const chunkTextByWords = (text, maxWords = 200) => {
  const words = text.split(/\s+/);
  const chunks = [];

  for (let i = 0; i < words.length; i += maxWords) {
    const chunk = words.slice(i, i + maxWords).join(" ");
    if (chunk.trim().length > 0) chunks.push(chunk);
  }

  return chunks;
};
