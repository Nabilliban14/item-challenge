# Architecture Documentation

## How to Run the Code

### Setup

0. Run `pnpm i` to install dependencies

1. Run `java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb` to start the DynamoDB local instance

2. Run `pnpm dev` to start the server

### Example curl Commands

**Get item by id:**
```bash
curl -X GET http://localhost:3000/api/items/6a98cd48-fb2a-497b-ab37-37f49549f47b -v \
  -H "Content-Type: application/json"
```

**Create version of item by id:**
```bash
curl -X POST http://localhost:3000/api/items/6a98cd48-fb2a-497b-ab37-37f49549f47b/versions \
  -H "Content-Type: application/json"
```

**Update item status:**
```bash
curl -X PUT http://localhost:3000/api/items/6a98cd48-fb2a-497b-ab37-37f49549f47b \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "status": "approved"
    }
  }'
```

**Insert item:**
```bash
curl -X POST http://localhost:3000/api/items -v \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "AP Biology",
    "itemType": "multiple-choice",
    "difficulty": 3,
    "content": {
      "question": "What is photosynthesis?", 
      "options": ["A", "B", "C", "D"],
      "correctAnswer": "A",
      "explanation": "Photosynthesis is the process by which plants, algae, and some bacteria use sunlight to convert water and carbon dioxide into glucose and oxygen."
    },
    "metadata": {
      "author": "test-author",
      "status": "draft",
      "tags": ["biology", "photosynthesis"]
    },
    "securityLevel": "standard"
  }'
```

## Data Model Design and DynamoDB Schema

### Primary Key Design

The DynamoDB table uses a **composite primary key** strategy:
- **Partition Key (PK):** `id` (string) - The unique item identifier (UUID)
- **Sort Key (SK):** `version` (number) - The version number

This design enables efficient versioning and audit trail queries. Since `version` is nested within `metadata.version` in the application data model, it is duplicated as a top-level field to serve as the sort key. This allows queries on the primary key to efficiently retrieve all versions of an item sorted by version number.

### Global Secondary Index (GSI) Design

**LatestVersionIndex GSI:**
- **Partition Key:** `latestVersion` (string) - Stored as "true" or "false" to track which version is current
- **Sort Key:** `lastModified` (number) - Timestamp for sorting by modification time

This GSI enables the `GET /api/items` endpoint to efficiently query only the latest versions of items, sorted by `lastModified` in descending order. The `latestVersion` field is used as a boolean flag (stored as a string) to mark which item version is the "current" version that should be returned for listing operations.

**Rationale for GSI Design:**
- The `lastModified` timestamp is used as the sort key in the GSI to support sorting by modification time
- Since `lastModified` is the sort key, we cannot also use `version` as an effective sort key in this GSI
- The `latestVersion` boolean flag allows filtering to only the current versions, avoiding the need to query all versions and filter client-side

### Future GSI Considerations

For the `GET /api/items` endpoint, which currently supports optional `subject` and `status` filtering, the following additional GSIs would be needed to support all query patterns:

1. **subjectLastModified GSI** - PK: `latestVersion`, SK: `subject#lastModified` (for filtering by subject)
2. **statusLastModified GSI** - PK: `latestVersion`, SK: `status#lastModified` (for filtering by status)
3. **subjectStatusLastModified GSI** - PK: `latestVersion` (composite), SK: `subject#status#lastModified` (for filtering by both)

When neither `subject` nor `status` filters are provided, the existing `LatestVersionIndex` GSI can be used to sort by `lastModified`.

### Data Duplication Strategy

To support efficient querying with GSIs, certain fields are duplicated at the top level:
- `version` - Duplicated from `metadata.version` to serve as the sort key
- `latestVersion` - Boolean flag (stored as string) to mark current versions for GSI queries
- `lastModified` - Duplicated from `metadata.lastModified` to serve as GSI sort key

This duplication is a common pattern in NoSQL databases to optimize for read performance at the cost of write complexity.

## Infrastructure Choices and Rationale

### DynamoDB

DynamoDB was chosen over in-memory storage to replicate actual database operations and provide a production-like environment. The table is configured with:
- **Billing Mode:** On-demand (pay-per-request) for flexible scaling
- **Point-in-Time Recovery:** Enabled for data protection
- **Encryption:** AWS-managed encryption at rest

### AWS CDK

CDK (Cloud Development Kit) was selected over Terraform due to familiarity and the ability to use TypeScript for infrastructure-as-code. The infrastructure is organized into separate stacks by resource type for better modularity and management:

- **DynamoDBStack** - Table and GSI definitions
- **LambdaStack** - Lambda function definitions with appropriate memory sizes and IAM roles
- **ApiGatewayStack** - API Gateway configuration and route definitions
- **IAMRolesStack** - IAM role definitions for Lambda functions
- **CloudWatchAlarmStack** - Monitoring and alerting configuration
- **SNSTopicStack** - SNS topic for alert notifications

### Lambda Configuration

Lambda functions are configured with different memory sizes based on their workload:
- Each function has a memory size appropriate to its task complexity
- IAM roles include:
  - Basic Lambda execution role
  - DynamoDB read/write permissions scoped to the specific operations needed by each function

### Monitoring and Alerting

CloudWatch alarms and SNS topics are configured to monitor:
- **Error rates** - Alert on Lambda function errors
- **High execution times** - Alert when functions exceed performance thresholds
- **High memory usage** - Alert when functions approach memory limits

Alerts are sent via email through SNS for proactive issue detection.

## Scalability & Performance Considerations

### Lambda Concurrency

As the system scales, AWS Lambda concurrency limits must be monitored. If approaching the limit, a quota increase should be requested to prevent throttling.

### GSI Limitations and Costs

**Current Limitations:**
- DynamoDB has a **20 GSI limit** per table
- Document size limit is **400KB**

**Performance Implications:**
- As more filter fields are added (beyond `subject` and `status`), additional GSIs may be required
- Each new GSI requires:
  - Backfilling existing data
  - Updating write operations to maintain GSI-specific fields
  - Increased write costs due to GSI replication

**Write Performance:**
- As more GSIs are added, write operations become heavier since each write must update all relevant GSIs
- The document size limit may be approached as more data is duplicated for GSI support
- GSI replication results in higher costs to support the duplicated partition data

### Query Optimization

The current implementation uses `ProjectionType.ALL` for GSIs, which includes all attributes. Future optimizations could include:
- Modifying projected attributes at the DynamoDB query level rather than parsing in Lambda code
- Using selective projections to reduce GSI size and costs

### Future Scaling Considerations

For complex query patterns, consider:
- **OpenSearch Integration** - For more flexible querying and filtering without GSI proliferation
- **Query Pattern Analysis** - Discuss future query patterns with stakeholders before adding more GSIs
- **Caching Strategy** - Implement caching for frequently accessed items to reduce DynamoDB read costs

## Security Approach

### Current State

The API Gateway is currently **open** (no authentication/authorization) for development purposes.

### Recommended Security Enhancements

1. **Private API Gateway**
   - Deploy API Gateway within a VPC if network isolation is required
   - Restrict access to specific IP ranges or VPC endpoints

2. **Lambda Authorizer**
   - Implement a Lambda authorizer function to validate requests
   - Support custom authentication tokens or API keys

3. **AWS Cognito Integration**
   - Add user authentication if user accounts are needed
   - Use Cognito User Pools for authentication
   - Combine with Lambda authorizer for fine-grained authorization

4. **IAM-Based Access Control**
   - Use IAM roles and policies for service-to-service authentication
   - Implement least-privilege access for Lambda functions

5. **Data Encryption**
   - Currently using AWS-managed encryption at rest for DynamoDB
   - Consider client-side encryption for sensitive data fields
   - Ensure TLS/HTTPS for all API communications (enabled by default with API Gateway)

## Trade-offs and Future Improvements

### Current Trade-offs

1. **Data Duplication vs. Query Performance**
   - Duplicating fields (version, latestVersion, lastModified) improves read performance
   - Increases write complexity and storage costs
   - Risk of data inconsistency if updates are not carefully managed

2. **NoSQL vs. Relational Database**
   - NoSQL (DynamoDB) prioritizes high availability and scalability
   - Data duplication in the same document makes access patterns easier
   - As we scale, updating duplicated fields may cause latency issues if done in too many places

3. **GSI Proliferation**
   - Each new filter field may require new GSIs
   - GSIs increase write costs and complexity
   - Limited to 20 GSIs per table

### Future Improvements

1. **Testing and Validation**
   - Deploy code and test Lambda runtimes in dev environment to ensure acceptable performance
   - Stress test with larger datasets to identify bottlenecks
   - Load test API endpoints to validate scalability assumptions

2. **Code Cleanup**
   - Separate code paths for deployed Lambdas vs. local testing
   - Remove duplicate code that handles both scenarios
   - Standardize on a single execution path

3. **Query Optimization**
   - Explore modifying projected attributes for queries at the DynamoDB level
   - Reduce data parsing in Lambda code
   - Implement query result caching where appropriate

4. **Alternative Query Solutions**
   - Evaluate OpenSearch integration for complex query patterns
   - Discuss future query patterns with stakeholders before adding more GSIs
   - Consider if a hybrid approach (DynamoDB + OpenSearch) would be more scalable

5. **Complete Implementation**
   - Finish implementing `GET /api/items` with full `subject` and `status` filtering support
   - Implement `GET /api/items/:id/audit` endpoint with pagination
   - The audit endpoint can leverage the primary composite key (id as PK, version as SK) to query all versions, sorted descending before returning

6. **Monitoring and Observability**
   - Add distributed tracing (AWS X-Ray) for request flow visibility
   - Implement custom CloudWatch metrics for business logic
   - Set up dashboards for key performance indicators

7. **Data Consistency**
   - Implement DynamoDB transactions where needed to ensure atomic updates across main table and GSIs
   - Add validation logic to prevent inconsistent state
   - Consider eventual consistency patterns where appropriate
