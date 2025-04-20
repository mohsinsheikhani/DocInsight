import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
} from "@aws-sdk/client-textract";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { Client } from "@opensearch-project/opensearch";

const textractClient = new TextractClient({
  region: "us-east-1",
  credentials: fromNodeProviderChain(),
});
const s3Client = new S3Client({
  region: "us-east-1",
  credentials: fromNodeProviderChain(),
});
const bedrockClient = new BedrockRuntimeClient({
  region: "us-east-1",
  credentials: fromNodeProviderChain(),
});

const osClient = new Client({
  node: process.env.OPENSEARCH_ENDPOINT,
  auth: {
    username: process.env.OS_USER,
    password: process.env.OS_PASS,
  },
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

      const chunks = chunkTextByWords(extractedText);

      // Store each chunk and its embedding
      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];

        // Get the embedding for the chunk
        const embedding = await getEmbedding(chunk);

        // Store the chunk and embedding in OpenSearch
        await storeEmbedding({
          chunk,
          embedding,
          source: documentKey,
          index,
        });

        console.log(`Stored chunk ${index + 1} for document: ${documentKey}`);
      }
    } else {
      console.error("Textract Job Failed:", response);
    }
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

const getEmbedding = async (text) => {
  const command = new InvokeModelCommand({
    modelId: "amazon.titan-embed-text-v2:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({ inputText: text }),
  });

  const response = await bedrockClient.send(command);
  const body = Buffer.from(response.body).toString("utf-8");
  return JSON.parse(body).embedding;
};

const storeEmbedding = async ({ chunk, embedding, source, index }) => {
  console.log(`Chunk ${index + 1}:`, chunk);

  if (
    !Array.isArray(embedding) ||
    embedding.some((v) => typeof v !== "number")
  ) {
    throw new Error("Invalid embedding vector format");
  }

  try {
    const exists = await osClient.indices.exists({ index: "documents" });

    if (!exists.body) {
      await osClient.indices.create({
        index: "documents",
        body: {
          settings: {
            index: {
              knn: true,
            },
          },
          mappings: {
            properties: {
              chunk: { type: "text" },
              embedding: {
                type: "knn_vector",
                dimension: 1024,
                method: {
                  name: "hnsw",
                  space_type: "cosinesimil",
                  engine: "nmslib",
                },
              },
              source: { type: "keyword" },
              chunk_index: { type: "integer" },
              timestamp: { type: "date" },
            },
          },
        },
      });
    }

    await osClient.index({
      index: "documents",
      id: Date.now().toString(),
      body: {
        chunk,
        embedding,
        source,
        chunk_index: index,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.log("Error", error);
  }
};
