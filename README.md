# Acala Network Data Extractor

A tool to extract and store detailed transaction information from Acala network.

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
- Stores data in MySQL database

## Database Schema

### Block Table (`acala_block`)
- id: Auto-increment ID
- number: Block number
- hash: Block hash
- timestamp: Block creation time

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

Run the extractor:
```bash
npm start
```

Configuration options (in `.env`):
- `INTERVAL_MS`: Polling interval in milliseconds (default: 3600000 - 1 hour)
- `ACALA_RPC_URL`: Acala network RPC endpoint (default: wss://acala-rpc.aca-api.network)
- `KARURA_RPC_URL`: Karura network RPC endpoint (default: wss://karura.api.onfinality.io/public-ws)

## License

[Apache License 2.0](LICENSE)