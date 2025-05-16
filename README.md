# Block Chain Data Extractor

[查看中文版本](README_cn.md) | [View English Version](#)

---

![Project Badge](https://img.shields.io/badge/Blockchain-Data-blue)
![License](https://img.shields.io/badge/License-Apache%202.0-green)

## Table of Contents
- [Features Overview](#features-overview)
- [Requirements](#requirements)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
  - [Extract Command](doc/en/transform_command.md)
  - [Transform Command](doc/en/transform_command.md)
  - [Block Command](doc/en/block_command.md)
  - [Truncate Command](doc/en/tuncate_command.md)
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

- Node.js 22.15+
- MySQL 5.7+
- Access to Acala node RPC

## Installation

1. Clone the repository
2. Install dependencies:
```bash
pnpm install
```

3. Configure database connections (copy .env.example to .env and edit):
```env
# Extract database
EXTRACT_DB_HOST="127.0.0.1"
EXTRACT_DB_PORT="3306"
EXTRACT_DB_USER="root"
EXTRACT_DB_PASSWORD="password"
EXTRACT_DB_NAME="QUERYWEB3"

# Transform database 
TRANSFORM_DB_HOST="127.0.0.1"
TRANSFORM_DB_PORT="3306"
TRANSFORM_DB_USER="root"
TRANSFORM_DB_PASSWORD="password"
TRANSFORM_DB_NAME="QUERYWEB3"
```

4. Run database migrations:
TBD

5. Build the project:
```bash
pnpm build
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
- [Block Command Details](doc/en/block_command.md)
- [Truncate Command Details](doc/en/truncate_command.md)
- [Usage Guide](doc/en/usage.md)

## License

[Apache License 2.0](LICENSE)