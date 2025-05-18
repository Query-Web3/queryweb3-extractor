# Migration Command

The migration command initializes and updates database schemas for the extractor system.

## Command Syntax

```bash
pnpm start migration [options]
```

## Options

| Option       | Description |
|--------------|-------------|
| --all        | Initialize all databases (batch, extract and transform) |
| --batch      | Initialize only batch database |
| --extract    | Initialize only extract database |
| --transform  | Initialize only transform database |

## Description

The migration command performs the following operations:

1. Connects to the specified database(s)
2. Creates the database if it doesn't exist
3. Executes SQL scripts to create all required tables
4. Sets up initial indexes and constraints
5. Logs all operations for auditing

## Database Configuration

The command uses the following environment variables:

- For batch database:
  - BATCH_DB_HOST
  - BATCH_DB_PORT
  - BATCH_DB_USER
  - BATCH_DB_PASSWORD
  - BATCH_DB_NAME

- For extract database:
  - EXTRACT_DB_HOST
  - EXTRACT_DB_PORT
  - EXTRACT_DB_USER
  - EXTRACT_DB_PASSWORD
  - EXTRACT_DB_NAME

- For transform database:
  - TRANSFORM_DB_HOST
  - TRANSFORM_DB_PORT
  - TRANSFORM_DB_USER
  - TRANSFORM_DB_PASSWORD
  - TRANSFORM_DB_NAME

## Examples

Initialize all databases:
```bash
pnpm start migration --all
```

Initialize only batch database:
```bash
pnpm start migration --batch
```

Initialize only extract database:
```bash
pnpm start migration --extract
```

Initialize only transform database:
```bash
pnpm start migration --transform
```

## Notes

1. Requires database admin credentials which will be prompted during execution
2. The command will not drop existing tables unless explicitly specified
3. All operations are logged to the batch_log table
4. Check logs for detailed execution results
