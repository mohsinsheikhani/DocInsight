import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { Client } from "@opensearch-project/opensearch";

const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });

const osClient = new Client({
  // node: process.env.OPENSEARCH_ENDPOINT,
  node: "https://search-intellidoc-test-ypvejuzpvmn6ctxvqe3sxjf5vy.us-east-1.es.amazonaws.com",
  auth: {
    username: "admin",
    password: "YourSecurePassword123!",
    // username: process.env.OS_USER,
    // password: process.env.OS_PASS,
  },
});

const getEmbedding = async (text) => {
  const command = new InvokeModelCommand({
    modelId: "amazon.titan-embed-text-v2:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({ inputText: text }),
  });

  const response = await bedrock.send(command);
  const responseBody = Buffer.from(response.body).toString("utf-8");
  const parsed = JSON.parse(responseBody);

  return parsed.embedding;
};

const generateAnswer = async (question, chunks) => {
  const context = chunks.join("\n\n");

  const command = new InvokeModelCommand({
    modelId: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: `You are a helpful assistant. Use the following context to answer the user's question.
            Context:
            ${context}
            Question: ${question}
            Answer:`,
        },
      ],
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 150,
      temperature: 0.2,
    }),
  });

  const response = await bedrock.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  let aiResponse = responseBody.content?.[0]?.text || "";

  return aiResponse;
};

const searchTopChunks = async (embedding, k = 3) => {
  const response = await osClient.search({
    index: "documents",
    body: {
      size: k,
      query: {
        knn: {
          embedding: {
            vector: embedding,
            k: k,
          },
        },
      },
    },
  });

  const hits = response.body.hits.hits;
  return hits.map((hit) => hit._source.chunk);
};

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const question = body.question;

    if (!question) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing question in request body" }),
      };
    }

    const embedding = await getEmbedding(question);
    const topChunks = await searchTopChunks(embedding);

    const answer = await generateAnswer(question, topChunks);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Embedding generated successfully",
        body: JSON.stringify({
          answer,
          contextPreview: topChunks,
        }),
      }),
    };
  } catch (err) {
    console.error("Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to process question" }),
    };
  }
};
