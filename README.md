# Acala Network Data Extractor

A tool to extract and store detailed transaction information from Acala network.

## Table of Contents
- [Features](#features)
- [Database Schema](#database-schema)
  - [Block Table](#block-table-acala_block)
  - [Batch Log Table](#batch-log-table-acala_batchlog)
  - [Extrinsic Table](#extrinsic-table-acala_extrinsic)
  - [Event Table](#event-table-acala_event)
  - [Newly Added Tables](#newly-added-tables-token-and-yield-statistics)
  - [Event Section Details](#event-section-and-method-details)
- [Installation](#installation)
- [Usage](#usage)
- [License](#license)

## Features

- Fetches block data including:
  - Block number and hash
  - Timestamp
- Extracts detailed transaction (extrinsic) information:
  - Transaction method
  - Signer address
  - Transaction fee
  - Transaction status
  - Transaction parameters
- Captures and stores chain events associated with transactions
- Supports fetching historical block data in specified range
- Automatic deduplication of blocks, transactions and events
- Stores data in MySQL database

## Database Schema

### Block Table (`acala_block`)
- id: Auto-increment ID
- number: Block number
- hash: Block hash
- timestamp: Block creation time

### Batch Log Table (`acala_batchlog`)
- id: Auto-increment ID
- batchId: Batch identifier
- startTime: Batch start time
- endTime: Batch end time (nullable)
- status: Batch status (FAILED/SUCCESS/RUNNING)
- retryCount: Number of retry attempts

### Extrinsic Table (`acala_extrinsic`)
- id: Auto-increment ID
- blockId: Reference to block
- index: Transaction index in block
- method: Transaction method
- signer: Signer address
- fee: Transaction fee
- status: Transaction status
- params: Transaction parameters (JSON)

### Event Table (`acala_event`)
- id: Auto-increment ID
- blockId: Reference to block
- extrinsicId: Reference to transaction (nullable)
- index: Event index
- section: Event section (e.g. system, balances, dex, homa, incentives, etc.)
- method: Event method (e.g. Transfer for balances section, Swap for dex section, etc.)
- data: Event data (JSON)

### Newly Added Tables (Token and Yield Statistics)

#### Chain Table (`dim_chains`)
- id: Auto-increment ID
- name: Network name (e.g. Polkadot, Kusama)
- chainId: Chain ID
- createdAt: Record creation time
- updatedAt: Record update time

#### Asset Type Table (`dim_asset_types`)
- id: Auto-increment ID
- name: Asset type name (e.g. DeFi, GameFi, NFT)
- createdAt: Record creation time

#### Return Type Table (`dim_return_types`)
- id: Auto-increment ID
- name: Return type name (e.g. Staking, Farming, Lending)
- createdAt: Record creation time

#### Token Table (`dim_tokens`)
- id: Auto-increment ID
- chainId: Reference to chain
- address: Token contract address
- symbol: Token symbol
- name: Token name
- decimals: Token decimals
- assetTypeId: Reference to asset type
- createdAt: Record creation time
- updatedAt: Record update time

#### Token Daily Stats Table (`fact_token_daily_stats`)
- id: Auto-increment ID
- tokenId: Reference to token
- date: Stat date
- volume: Trading volume
- volumeUsd: Trading volume in USD
- txnsCount: Transaction count
- priceUsd: Token price in USD
- volumeYoy: Year-over-year volume growth (%)
- volumeQoq: Quarter-over-quarter volume growth (%)
- txnsYoy: Year-over-year transaction count growth (%)
- createdAt: Record creation time

#### Yield Stats Table (`fact_yield_stats`)
- id: Auto-increment ID
- tokenId: Reference to token
- returnTypeId: Reference to return type
- poolAddress: Liquidity pool address
- date: Stat date
- apy: Annual percentage yield (%)
- tvl: Total value locked
- tvlUsd: Total value locked in USD
- createdAt: Record creation time

#### Stat Cycle Table (`dim_stat_cycles`)
- id: Auto-increment ID
- name: Cycle name (daily, weekly, monthly, yearly)
- days: Number of days in cycle
- createdAt: Record creation time

### Event Section and Method Details

The `section` and `method` fields in the event table represent the module and event type from the Acala chain. These values are dynamic and depend on the chain's runtime modules. Here are some common sections and their methods:

#### System Events (section: 'system')
- ExtrinsicSuccess
- ExtrinsicFailed
- NewAccount
- KilledAccount

#### Balances Events (section: 'balances')
- Transfer
- Deposit
- Withdraw
- Endowed

#### DEX Events (section: 'dex')
- Swap
- AddLiquidity
- RemoveLiquidity
- TradingPairCreated

#### Homa Events (section: 'homa')
- Minted
- RequestedRedeem
- Redeemed

#### Incentives Events (section: 'incentives')
- Deposited
- Withdrawn
- Claimed

Note: The actual available sections and methods depend on the Acala runtime version and configuration. For the most up-to-date list, refer to the [Acala documentation](https://wiki.acala.network/).

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Set up database connection in `.env` file:
```env
DATABASE_URL="mysql://user:password@localhost:3306/db_name"
```

4. Run database migrations:
```bash
npx prisma migrate dev
```

5. Build the project:
```bash
npm run build
```

## Usage

### Main Commands

Run the extractor:
```bash
npm start
```

Extract data from Acala network:
```bash
npm run extract
```

Extract historical data (specify block range):
```bash
npm run extract -- --startBlock=1000000 --endBlock=1000100
```

Transform raw data to dimensional models:
```bash
npm run transform
```

Get current blockchain details:
```bash
npm run block
```

### Block Command Details

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

### Historical Data Extraction Options

When running the extract command, you can specify:

- `--startBlock`: Starting block number (inclusive)
- `--endBlock`: Ending block number (inclusive)

Example:
```bash
# Extract blocks 1000000 to 1000100
npm run extract -- --startBlock=1000000 --endBlock=1000100
```

Note: When extracting historical data, the process will:
1. Only run once (not continuously)
2. Skip any blocks that already exist in database
3. Skip any transactions/events that already exist in database

### Using PM2 for Production

To run the extract and transform processes as background services using PM2:

1. Install PM2 globally (if not already installed):
```bash
npm install -g pm2
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

### Configuration options (in `.env`):
- `EXTRACT_INTERVAL_MS`: Extract polling interval in milliseconds (default: 3600000 - 1 hour)
- `TRANSFORM_INTERVAL_MS`: Transform polling interval in milliseconds (default: 3600000 - 1 hour)
- `ACALA_RPC_URL`: Acala network RPC endpoint (default: wss://acala-rpc.aca-api.network)
- `KARURA_RPC_URL`: Karura network RPC endpoint (default: wss://karura.api.onfinality.io/public-ws)

## License

[Apache License 2.0](LICENSE)
