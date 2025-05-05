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
| Field | Type | Description |
|-------|------|-------------|
| id | int(11) | Auto-increment ID |
| number | int(11) | Block number |
| hash | varchar(191) | Block hash |
| timestamp | datetime(3) | Block creation time |
| batchId | char(36) | Batch identifier |

### Batch Log Table (`acala_batchlog`)
| Field | Type | Description |
|-------|------|-------------|
| id | int(11) | Auto-increment ID |
| batchId | char(36) | Batch identifier |
| startTime | datetime(3) | Batch start time |
| endTime | datetime(3) | Batch end time (nullable) |
| status | enum('0','1','2') | Batch status (0=FAILED, 1=SUCCESS, 2=RUNNING) |
| retryCount | int(11) | Number of retry attempts |
| type | enum('1','2') | Batch type |
| processed_block_count | int(11) | Number of processed blocks |
| last_processed_height | int(11) | Last processed block height |
| lock_key | varchar(191) | Lock key for distributed processing |
| lock_time | datetime(3) | Lock timestamp |
| lock_status | smallint | Lock status |

### Extrinsic Table (`acala_extrinsic`)
| Field | Type | Description |
|-------|------|-------------|
| id | int(11) | Auto-increment ID |
| blockId | int(11) | Reference to block |
| index | int(11) | Transaction index in block |
| method | text | Transaction method |
| signer | varchar(191) | Signer address |
| fee | varchar(191) | Transaction fee |
| status | varchar(191) | Transaction status |
| params | longtext | Transaction parameters (JSON) |
| batchId | char(36) | Batch identifier |

### Event Table (`acala_event`)
| Field | Type | Description |
|-------|------|-------------|
| id | int(11) | Auto-increment ID |
| blockId | int(11) | Reference to block |
| extrinsicId | int(11) | Reference to transaction (nullable) |
| index | int(11) | Event index |
| section | varchar(191) | Event section (e.g. system, balances, dex) |
| method | varchar(191) | Event method (e.g. Transfer, Swap) |
| data | longtext | Event data (JSON) |
| batchId | char(36) | Batch identifier |

### Newly Added Tables (Token and Yield Statistics)

#### Chain Table (`dim_chains`)
| Field | Type | Description |
|-------|------|-------------|
| id | int | Auto-increment ID |
| name | varchar(50) | Network name (e.g. Polkadot, Kusama) |
| chain_id | int | Chain ID |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Record update time |
| latest_block | int | Latest block height |
| latest_block_time | timestamp | Latest block time |

#### Asset Type Table (`dim_asset_types`)
| Field | Type | Description |
|-------|------|-------------|
| id | int | Auto-increment ID |
| name | varchar(50) | Asset type name (e.g. DeFi, GameFi, NFT) |
| created_at | timestamp | Record creation time |

#### Return Type Table (`dim_return_types`)
| Field | Type | Description |
|-------|------|-------------|
| id | int | Auto-increment ID |
| name | varchar(50) | Return type name (e.g. Staking, Farming, Lending) |
| created_at | timestamp | Record creation time |

#### Token Table (`dim_tokens`)
| Field | Type | Description |
|-------|------|-------------|
| id | int | Auto-increment ID |
| chain_id | int | Reference to chain |
| address | varchar(42) | Token contract address |
| symbol | varchar(20) | Token symbol |
| name | varchar(100) | Token name |
| decimals | int | Token decimals |
| asset_type_id | int | Reference to asset type |
| price_usd | decimal(65,18) | USD price |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Record update time |

#### Token Daily Stats Table (`fact_token_daily_stats`)
| Field | Type | Description |
|-------|------|-------------|
| id | bigint | Auto-increment ID |
| token_id | int | Reference to token |
| date | date | Stat date |
| volume | decimal(65,18) | Trading volume |
| volume_usd | decimal(65,18) | Trading volume in USD |
| txns_count | int | Transaction count |
| price_usd | decimal(65,18) | Token price in USD |
| volume_yoy | decimal(10,2) | Year-over-year volume growth (%) |
| volume_qoq | decimal(10,2) | Quarter-over-quarter volume growth (%) |
| txns_yoy | decimal(10,2) | Year-over-year transaction count growth (%) |
| created_at | timestamp | Record creation time |

#### Yield Stats Table (`fact_yield_stats`)
| Field | Type | Description |
|-------|------|-------------|
| id | bigint | Auto-increment ID |
| token_id | int | Reference to token |
| return_type_id | int | Reference to return type |
| pool_address | varchar(42) | Liquidity pool address |
| date | date | Stat date |
| apy | decimal(10,2) | Annual percentage yield (%) |
| tvl | decimal(65,18) | Total value locked |
| tvl_usd | decimal(65,18) | Total value locked in USD |
| created_at | timestamp | Record creation time |

#### Stat Cycle Table (`dim_stat_cycles`)
| Field | Type | Description |
|-------|------|-------------|
| id | int | Auto-increment ID |
| name | varchar(20) | Cycle name (daily, weekly, monthly, yearly) |
| days | int | Number of days in cycle |
| created_at | timestamp | Record creation time |

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
npm run extract -- --startBlock=1000000 --endBlock=1000100

# Extract from block 1000000 to latest
npm run extract -- --startBlock=1000000

# Extract from block 0 to 1000100
npm run extract -- --endBlock=1000100

# Auto-detect range (from DB highest+1 to latest)
npm run extract
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

### Rebuilding the Project
```bash
./rebuild.sh
./start_service.sh
```

### Configuration options (in `.env`):
- Database Connection (Required):
  - `EXTRACT_DB_HOST`: Extract database host (default: "127.0.0.1")
  - `EXTRACT_DB_PORT`: Extract database port (default: "3306")
  - `EXTRACT_DB_USER`: Extract database username (default: "root")
  - `EXTRACT_DB_PASSWORD`: Extract database password (default: "password")
  - `EXTRACT_DB_NAME`: Extract database name (default: "QUERYWEB3")
  - `TRANSFORM_DB_HOST`: Transform database host (default: "127.0.0.1")
  - `TRANSFORM_DB_PORT`: Transform database port (default: "3306")
  - `TRANSFORM_DB_USER`: Transform database username (default: "root")
  - `TRANSFORM_DB_PASSWORD`: Transform database password (default: "password")
  - `TRANSFORM_DB_NAME`: Transform database name (default: "QUERYWEB3")

- Task Scheduling:
  - `EXTRACT_INTERVAL_MS`: Extract polling interval in milliseconds (default: 3600000 - 1 hour)
  - `TRANSFORM_INTERVAL_MS`: Transform polling interval in milliseconds (default: 3600000 - 1 hour)

- Network Endpoints:
  - `ACALA_RPC_URL`: Acala network RPC endpoint (default: wss://acala-rpc.aca-api.network)
  - `KARURA_RPC_URL`: Karura network RPC endpoint (default: wss://karura.api.onfinality.io/public-ws)

## License

[Apache License 2.0](LICENSE)
