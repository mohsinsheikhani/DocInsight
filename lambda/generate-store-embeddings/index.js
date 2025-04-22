import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { Client } from "@opensearch-project/opensearch";

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
  const { chunk, documentKey, index } = event;

  console.log("Chunk", { chunk, documentKey, index });

  try {
    const command = new InvokeModelCommand({
      modelId: "amazon.titan-embed-text-v2:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({ inputText: chunk }),
    });

    const response = await bedrockClient.send(command);
    const body = Buffer.from(response.body).toString("utf-8");
    const embedding = JSON.parse(body).embedding;

    await storeEmbedding({
      chunk,
      embedding,
      source: documentKey,
      index,
    });

    console.log(`Stored chunk ${index} for document: ${documentKey}`);

    return {
      chunk,
      embedding,
    };
  } catch (error) {
    console.error("Error processing document:", error);
  }
};

const storeEmbedding = async ({ chunk, embedding, source, index }) => {
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
