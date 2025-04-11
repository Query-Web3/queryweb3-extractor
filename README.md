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
- section: Event section
- method: Event method
- data: Event data (JSON)

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