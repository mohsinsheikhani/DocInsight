# DocInsight

### A Production-Grade, Serverless MLOps Pipeline for Inference and Retrieval-Augmented Generation (RAG)

---

## About the Project

**DocInsight** is a fully serverless, MLOps-enabled document intelligence system built on AWS. It automates the lifecycle of unstructured document processing: from extraction and semantic understanding to natural language querying and AI-generated answers.

> This project is a serverless MLOps pipeline for AI-driven document processing, automating text extraction, refinement, and analysis. It leverages AWS Textract, SageMaker, OpenSearch, and Bedrock, orchestrated via Step Functions, and deployed using AWS CDK.

---

## Architecture

![MLOps](https://github.com/user-attachments/assets/ebf9e498-62c3-4c6d-b8d1-f0a019ce63d4)


| Component                        | Role                                       |
| -------------------------------- | ------------------------------------------ |
| **Amazon Textract**              | Extracts structured text from PDFs/images  |
| **Amazon SageMaker (Cohere v3)** | Generates semantic embeddings              |
| **Amazon OpenSearch**            | Stores vectors for retrieval-based search  |
| **Amazon Bedrock (Claude)**      | Generates final natural language answers   |
| **Step Functions**               | Orchestrates the end-to-end workflow       |
| **API Gateway + Lambda**         | Enables file upload and question answering |
| **AWS CDK**                      | Provisions and deploys the infrastructure  |

---

## Features

- Upload Document: Users upload PDFs/images via API Gateway → S3.
- Step Function Workflow:
  - Starts Textract Job (async)
  - Waits for completion
  - Extracts + chunks text
  - Invokes SageMaker model to generate embeddings
  - Stores embeddings in Amazon OpenSearch
- Semantic Search: Converts user questions into embeddings → finds relevant text chunks.
- LLM Responses: Uses Amazon Bedrock (Claude) to answer questions contextually.



---

## Use Cases

- Document Q&A for Enterprises
- Medical/Financial/Legal document processing
- Context-aware search on historical archives
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
