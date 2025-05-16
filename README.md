# Block Chain Data Extractor

## Table of Contents
- [Features Overview](#features-overview)
- [Requirements](#requirements)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
  - [Extract Command](#extract-command)
  - [Transform Command](#transform-command)
- [Detailed Documentation](#detailed-documentation)
- [License](#license)

A blockchain data extraction tool for retrieving and storing detailed transaction information from Polkadot/Substrate-based networks.

## Features Overview

- Retrieves block data (block number, hash, timestamp)
- Extracts detailed transaction information (method, signer address, fees, etc.)
- Captures and stores on-chain events
- Supports historical data extraction within specified ranges
- Automatic deduplication mechanism
- Stores data in MySQL database

## Requirements

- Node.js 16+
- MySQL 5.7+
- Access to Acala node RPC

## Installation

1. Clone the repository
2. Install dependencies:
```bash
pnpm install
```

3. Configure database connection (edit .env file):
```env
DATABASE_URL="mysql://user:password@localhost:3306/db_name"
```

4. Run database migrations:
```bash
pnpm exec prisma migrate dev
```

5. Build the project:
```bash
ppnpm start build
```

## Basic Usage

### Start the extractor
```bash
pnpm start
```

### Extract data from Acala network
```bash
ppnpm start extract
```

### Transform raw data into dimensional models
```bash
ppnpm start transform
```

### View block information
```bash
ppnpm start block
```

For more detailed documentation, please refer to:
- [Database Structure](doc/en/database.md)
- [Events Specification](doc/en/events.md)  
- [Extract Command Details](doc/en/extract_command.md)
- [Transform Command Details](doc/en/transform_command.md)
- [Usage Guide](doc/en/usage.md)
- [Chinese Documentation](doc/cn/usage.md)

## License

[Apache License 2.0](LICENSE)

[View Chinese Version](README_cn.md)
