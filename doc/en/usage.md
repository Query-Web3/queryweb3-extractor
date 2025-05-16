# Detailed Usage Documentation

## Main Commands

### Run the extractor
```bash
pnpm start
```

### Extract data from Acala network
```bash
pnpm start extract
```

### Truncate tables with specified prefix(es)
```bash
pnpm start truncate -- --schema=prefix
# Multiple prefixes example:
pnpm start truncate -- --schema=dim,fact  # Will truncate dim_* and fact_* tables
```

### Transform raw data to dimensional models
```bash
pnpm start transform
```

### Get current blockchain information
```bash
pnpm start block
```

## Block Command Details

The `block` command provides real-time blockchain information including:

- Current block details:
  - Block number
  - Block hash
  - Timestamp
  - Parent hash
- Chain information:
  - Chain name
  - Node name
  - Node version
- Chain statistics:
  - Total blocks
  - Finalized block number

Example output:
```json
{
  "currentBlock": {
    "number": 1234567,
    "hash": "0x123...abc",
    "timestamp": "2025-04-30T13:42:00.000Z",
    "parentHash": "0x456...def"
  },
  "chainInfo": {
    "chain": "Acala",
    "nodeName": "acala-node",
    "nodeVersion": "1.2.3"
  },
  "chainStats": {
    "totalBlocks": 1234567,
    "finalizedBlock": 1234560
  }
}
```

## Historical Data Extraction Options

When running the extract command, you can specify:

- `-s|--startBlock`: Starting block number (inclusive)
- `-e|--endBlock`: Ending block number (inclusive)

Parameter combinations:
1. Both `-s` and `-e` specified: Process blocks in specified range
2. Only `-s` specified: Process from startBlock to latest block
3. Only `-e` specified: Process from block 0 to endBlock
4. No parameters: Auto-detect range from database highest block+1 to latest block

Examples:
```bash
# Extract blocks 1000000 to 1000100
pnpm start extract -- --startBlock=1000000 --endBlock=1000100

# Extract from block 1000000 to latest
pnpm start extract -- --startBlock=1000000

# Extract from block 0 to 1000100
pnpm start extract -- --endBlock=1000100

# Auto-detect range (from DB highest+1 to latest)
pnpm start extract
```

Note: When extracting historical data, the process will:
1. Only run once (not continuously)
2. Skip any blocks that already exist in database
3. Skip any transactions/events that already exist in database

## Using PM2 for Production

To run the extract and transform processes as background services using PM2:

1. Install PM2 globally (if not already installed):
```bash
pnpm install -g pm2
```

2. Start services process:
```bash
./start_service.sh
```

3. Check process status:
```bash
pm2 list
```

4. View logs:
```bash
pm2 logs
```

## Rebuilding the Project
```bash
./rebuild.sh
./start_service.sh
```

## Configuration options (in `.env`):
- Database Connection (Required):
  - Extract Process (must use EXTRACT_DB_ prefix):
    - `EXTRACT_DB_HOST`: Extract database host (required)
    - `EXTRACT_DB_PORT`: Extract database port (default: "3306")
    - `EXTRACT_DB_USER`: Extract database username (required)
    - `EXTRACT_DB_PASSWORD`: Extract database password (required)
    - `EXTRACT_DB_NAME`: Extract database name (required)
  
  - Transform Process (must use TRANSFORM_DB_ prefix):
    - `TRANSFORM_DB_HOST`: Transform database host (required)
    - `TRANSFORM_DB_PORT`: Transform database port (default: "3306")
    - `TRANSFORM_DB_USER`: Transform database username (required)
    - `TRANSFORM_DB_PASSWORD`: Transform database password (required)
    - `TRANSFORM_DB_NAME`: Transform database name (required)
  
  Note: The extract and transform processes now require their own dedicated database connections. 
  The fallback to generic DB_ variables has been removed to prevent configuration errors.

- Task Scheduling:
  - `EXTRACT_INTERVAL_MS`: Extract polling interval in milliseconds (default: 3600000 - 1 hour)
  - `TRANSFORM_INTERVAL_MS`: Transform polling interval in milliseconds (default: 3600000 - 1 hour)

- Network Endpoints:
  - `ACALA_RPC_URL`: Acala network RPC endpoint (default: wss://acala-rpc.aca-api.network)
  - `KARURA_RPC_URL`: Karura network RPC endpoint (default: wss://karura.api.onfinality.io/public-ws)
