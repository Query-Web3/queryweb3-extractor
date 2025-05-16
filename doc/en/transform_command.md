# Transform Command Details

## Function Description
The transform command converts extracted Acala data to dimensional tables, with main functions including:
- View last transform batchlog record
- Pause/resume transform batches
- Execute standard data transformation

## Execution Flowchart
```mermaid
graph TD
    A[Start] --> B{Options?}
    B -->|--batchlog| C[Show last batchlog]
    B -->|--pause| D[Pause specified batch]
    B -->|--resume| E[Resume unfinished batch]
    B -->|No options| F[Execute transformation]
    C --> G[End]
    D --> G
    E --> G
    F --> H[Initialize data source]
    H --> I[Query latest block]
    I --> J[Process Acala block data]
    J --> K[Process extrinsics]
    K --> L[Process events]
    L --> M[Batch process tokens]
    M --> N[Initialize dimension tables]
    N --> O[Cache dimensions to Redis]
    O --> P[Process statistics]
    P --> Q[Validate data consistency]
    Q --> G
```

## Parameter Description
| Parameter | Short | Required | Description |
|-----------|-------|----------|-------------|
| --batchlog | -b | No | Show last transform batchlog record |
| --resume | -r | No | Resume non-SUCCESS transform batch |
| --pause | -p | No | Pause running transform batch by ID |

## Processing Logic
1. **Parameter Parsing**:
   - Check input options
   - Determine execution mode (log/pause/resume/transform)

2. **Operation Execution**:
   - Batchlog: Query and display last record
   - Pause: Stop specified batch by ID
   - Resume: Continue unfinished batch
   - Transform: Execute standard transformation

3. **Core Transformation Flow**:
   - Initialize data source and database connection
   - Query latest block as reference point
   - Process Acala block data to collect token IDs
   - Process extrinsics and events to collect more token IDs
   - Batch process all tokens to dimension tables
   - Initialize and cache dimension tables (DimChain, DimAssetType etc.)
   - Process token and yield statistics
   - Validate data consistency

4. **Result Handling**:
   - Display operation results
   - Clean up resources

## Typical Usage
```bash
# View last batchlog
pnpm start transform -- --batchlog

# Pause batch with ID 123
pnpm start transform -- --pause=123

# Resume unfinished batch
pnpm start transform -- --resume

# Execute standard transformation
pnpm start transform
