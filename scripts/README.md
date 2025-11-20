# Scripts

Utility scripts for local development and setup.

## create-local-table.ts

Creates the `ExamItems` DynamoDB table in your local DynamoDB instance.

### Prerequisites

1. **Start DynamoDB Local:**
   ```bash
   java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb
   ```

2. **Set environment variables (optional):**
   ```bash
   export DYNAMODB_ENDPOINT=http://localhost:8000
   export DYNAMODB_TABLE_NAME=ExamItems
   ```

### Usage

```bash
# Using npm script
pnpm create-local-table

# Or directly with tsx
DYNAMODB_ENDPOINT=http://localhost:8000 tsx scripts/create-local-table.ts
```

### What it creates

- **Table:** `ExamItems`
- **Primary Key:**
  - Partition Key: `id` (STRING)
  - Sort Key: `version` (NUMBER)
- **Global Secondary Index:** `LatestVersionIndex`
  - Partition Key: `latestVersion` (STRING)
  - Sort Key: `lastModified` (NUMBER)
  - Projection: ALL

### Notes

- The script is idempotent - it won't fail if the table already exists
- The table uses `PAY_PER_REQUEST` billing mode (on-demand)
- All attribute definitions are included for both primary and GSI keys

