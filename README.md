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
  - [Extract Command](#extract-command) ([Details](doc/en/extract_command.md))
  - [Transform Command](#transform-command) ([Details](doc/en/transform_command.md))
  - [Block Command](#block-command) ([Details](doc/en/block_command.md))
  - [Truncate Command](#truncate-command) ([Details](doc/en/truncate_command.md))
  - [Migration Command](#migration-command) ([Details](doc/en/migration_command.md))
- [Database Structure](doc/en/database.md)
- [Events Specification](doc/en/events.md)
- [Usage Guide](doc/en/usage.md)
- [License](#license)
- [View Chinese Version](README_cn.md)

## Features Overview

- Retrieves block data (block number, hash, timestamp)
- Extracts detailed transaction information (method, signer address, fees, etc.)
- Captures and stores on-chain events
- Supports historical data extraction within specified ranges
- Automatic deduplication mechanism
- Stores data in MySQL database
- Database migration tool for schema management

## Requirements

- Node.js 22.15+ (pnpm 8.10+)
- MySQL 5.7+
- Redis 5.0+
- Access to Acala node RPC

## Installation

1. Clone the repository
2. Install dependencies:
```bash
pnpm install
```

3. Configure database connections (copy .env.example to .env and edit):
```env
# Batch database
BATCH_DB_HOST="127.0.0.1"
BATCH_DB_PORT="3306"
BATCH_DB_USER="root"
BATCH_DB_PASSWORD="password"
BATCH_DB_NAME="QUERYWEB3_BATCH"

# Extract database
EXTRACT_DB_HOST="127.0.0.1"
EXTRACT_DB_PORT="3306"
EXTRACT_DB_USER="root"
EXTRACT_DB_PASSWORD="password"
EXTRACT_DB_NAME="QUERYWEB3_EXTRACT"

# Transform database 
TRANSFORM_DB_HOST="127.0.0.1"
TRANSFORM_DB_PORT="3306"
TRANSFORM_DB_USER="root"
TRANSFORM_DB_PASSWORD="password"
TRANSFORM_DB_NAME="QUERYWEB3"

# Redis cache configuration
REDIS_HOST="127.0.0.1"
REDIS_PORT="6379"
REDIS_PASSWORD=""
```

4. Run database migrations:
```bash
pnpm start migration --all
```

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

### Initialize or update database schema
```bash
# Initialize all databases and tables
ppnpm start migration --all

# Initialize only batch database
ppnpm start migration --batch

# Initialize only extract database
ppnpm start migration --extract

# Initialize only transform database
ppnpm start migration --transform
```

For more detailed documentation, please refer to:
- [Database Structure](doc/en/database.md)
- [Events Specification](doc/en/events.md)  
- [Extract Command Details](doc/en/extract_command.md)
- [Transform Command Details](doc/en/transform_command.md)
- [Block Command Details](doc/en/block_command.md)
- [Truncate Command Details](doc/en/truncate_command.md)
- [Migration Command Details](doc/en/migration_command.md)
- [Usage Guide](doc/en/usage.md)

## License

[Apache License 2.0](LICENSE)
