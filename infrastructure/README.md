# Infrastructure as Code

This directory contains the AWS CDK infrastructure definitions for the Item Challenge application.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 22+ and pnpm installed
- AWS CDK CLI (installed as dev dependency)

## Setup

1. **Install dependencies:**
   ```bash
   cd infrastructure
   pnpm install
   ```

2. **Bootstrap CDK (first time only):**
   ```bash
   pnpm cdk bootstrap
   ```

## Available Commands

- `pnpm synth` - Synthesize CloudFormation template (validates infrastructure code)
- `pnpm diff` - Compare deployed stack with current state
- `pnpm cdk deploy` - Deploy the stack to AWS (optional - not required for challenge)
- `pnpm cdk destroy` - Destroy the stack (optional)

## Stack Definition

The `ItemChallengeStack` defines:

- **DynamoDB Table**: `ExamItems`
  - Partition Key: `id` (String)
  - Sort Key: `version` (Number)
  - Billing Mode: Pay-per-request (on-demand)
  - Encryption: AWS managed
  - Point-in-time recovery: Enabled

## Validation

To validate the infrastructure code without deploying:

```bash
cd infrastructure
pnpm synth
```

This will generate CloudFormation templates and validate the CDK code.

