# DocInsight

### A Serverless MLOps Pipeline for Inference and Retrieval-Augmented Generation (RAG)

---

## About the Project

**DocInsight** is a fully serverless, MLOps-enabled document intelligence system built on AWS. It automates the lifecycle of unstructured document processing: from extraction and semantic understanding to natural language querying and AI-generated answers.

> This project implements a serverless MLOps pipeline for AI-driven document processing, automating text extraction, embedding generation, and natural language querying. It leverages AWS Textract, SageMaker, OpenSearch, Bedrock, EventBridge, Step Functions, and deployed using AWS CDK.

---

## Architecture

![MLOps-diagram](https://github.com/user-attachments/assets/0cc2f544-8380-4399-a1a4-991ca819f1e3)

| Component                        | Role                                       |
| -------------------------------- | ------------------------------------------ |
| **Amazon Textract**              | Extracts structured text from PDFs/images  |
| **Amazon SageMaker (Cohere v3)** | Generates semantic embeddings              |
| **Amazon OpenSearch**            | Stores vectors for retrieval-based search  |
| **Amazon Bedrock (Claude)**      | Generates final natural language answers   |
| **Step Functions**               | Orchestrates the end-to-end workflow       |
| **Amazon EventBridge**           | Triggers Step Function on S3 upload        |
| **Amazon S3**                    | Stores uploaded documents                  |
| **Dead Letter Queue**            | Captures failed EventBridge invocations    |
| **API Gateway + Lambda**         | Enables file upload and question answering |
| **AWS CDK**                      | Provisions and deploys the infrastructure  |

---

## Features

- **Upload Document**:
  - Users upload PDFs/images via API Gateway → S3 → EventBridge automatically triggers Step Function Workflow.
- **Step Function Workflow**:
  - Starts an asynchronous Textract Job
  - Monitors and waits for job completion
  - Extracts and chunks text
  - Invokes SageMaker model to generate semantic embeddings
  - Stores embeddings in Amazon OpenSearch for semantic search
- **Semantic Search**:
  - Converts user questions into embeddings → finds the most relevant document chunks.
- **LLM Response Generation**:
  - Uses Amazon Bedrock (Claude) to generate context-aware answers based on the retrieved document context.
- **Fault Tolerance**:
  - EventBridge failures are routed to a Dead Letter Queue (DLQ) for inspection and retries.

---

## Use Cases

- Document Q&A for Enterprises
- Medical/Financial/Legal document processing
- Internal knowledge base automation

---

## API Endpoints

| Endpoint  | Method | Description                                                            |
| --------- | ------ | ---------------------------------------------------------------------- |
| `/upload` | POST   | Upload a binary PDF/image file via API Gateway to S3                   |
| `/ask`    | POST   | Accepts a natural language question and returns an AI-generated answer |

## Demo

### Sample Upload

![image](https://github.com/user-attachments/assets/d07ca289-a877-4ac6-9954-815f234cbd63)

### Sample Response Generation

![image](https://github.com/user-attachments/assets/53d2d333-d00b-488c-82dd-40d210e060cc)

---

## Getting Started

##### Prerequisites

- AWS CLI + CDK configured
- Node.js + Typescript environment
- Subscription to the embedding model and Claude for response generation
- Fill up the `.env` file, variables used for OpenSearch Domain

##### Clone the Repository

```bash
git clone https://github.com/mohsinsheikhani/DocInsight.git
cd docinsight
```

##### Setup

```bash
cd docinsight
npm install
cdk deploy
```

---

🚀 **Follow me on [LinkedIn](https://www.linkedin.com/in/mohsin-sheikhani/) for more AWS content!**
