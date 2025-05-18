import { DataSource } from 'typeorm';
import { executeSqlFile } from './database';

import { Logger } from '../../utils/logger';
const logger = Logger.getInstance();

export async function migrateTransform(datasource: DataSource) {
  const sql = `
    DROP TABLE IF EXISTS \`dim_asset_types\`;
    CREATE TABLE \`dim_asset_types\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`name\` varchar(50) NOT NULL COMMENT 'Asset type name, e.g. DeFi, GameFi, NFT',
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`unique_name\` (\`name\`),
      UNIQUE KEY \`name\` (\`name\`)
    ) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Asset types table';

    DROP TABLE IF EXISTS \`dim_chains\`;
    CREATE TABLE \`dim_chains\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`name\` varchar(50) NOT NULL COMMENT 'Chain name, e.g. Polkadot, Kusama, Hydration, Bifrost',
      \`chain_id\` int NOT NULL COMMENT 'Chain ID',
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`name\` (\`name\`)
    ) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Blockchain networks table';

    DROP TABLE IF EXISTS \`dim_return_types\`;
    CREATE TABLE \`dim_return_types\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`name\` varchar(50) NOT NULL COMMENT 'Return type, e.g. Staking, Farming, Lending',
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`unique_name\` (\`name\`),
      UNIQUE KEY \`name\` (\`name\`)
    ) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Return types table';

    DROP TABLE IF EXISTS \`dim_stat_cycles\`;
    CREATE TABLE \`dim_stat_cycles\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`name\` varchar(20) NOT NULL COMMENT 'Stat cycle name (daily/weekly/monthly/yearly)',
      \`days\` int NOT NULL COMMENT 'Cycle days',
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`unique_name\` (\`name\`),
      UNIQUE KEY \`name\` (\`name\`)
    ) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stat cycles table';

    DROP TABLE IF EXISTS \`dim_tokens\`;
    CREATE TABLE \`dim_tokens\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`chain_id\` int NOT NULL COMMENT 'Chain ID',
      \`address\` varchar(42) NOT NULL COMMENT 'Token contract address',
      \`symbol\` varchar(20) NOT NULL COMMENT 'Token symbol',
      \`name\` varchar(100) NOT NULL COMMENT 'Token name',
      \`decimals\` int NOT NULL COMMENT 'Decimals',
      \`asset_type_id\` int NOT NULL COMMENT 'Asset type ID',
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`unique_token\` (\`chain_id\`,\`address\`)
    ) ENGINE=InnoDB AUTO_INCREMENT=767102 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tokens table';

    DROP TABLE IF EXISTS \`etl_control\`;
    CREATE TABLE \`etl_control\` (
      \`task_name\` varchar(100) NOT NULL COMMENT 'ETL task name',
      \`last_run\` datetime DEFAULT NULL COMMENT 'Last run time',
      PRIMARY KEY (\`task_name\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ETL task control table';

    DROP TABLE IF EXISTS \`fact_token_daily_stats\`;
    CREATE TABLE \`fact_token_daily_stats\` (
      \`id\` bigint NOT NULL AUTO_INCREMENT,
      \`token_id\` int NOT NULL COMMENT 'Token ID',
      \`date\` date NOT NULL COMMENT 'Date',
      \`volume\` decimal(65,18) NOT NULL COMMENT 'Volume',
      \`volume_usd\` decimal(65,18) NOT NULL COMMENT 'USD volume',
      \`txns_count\` int NOT NULL COMMENT 'Transaction count',
      \`price_usd\` decimal(36,18) NOT NULL COMMENT 'USD price',
      \`volume_yoy\` decimal(65,18) DEFAULT NULL COMMENT 'Volume year-over-year growth(%)',
      \`volume_qoq\` decimal(65,18) DEFAULT NULL COMMENT 'Volume quarter-over-quarter growth(%)',
      \`txns_yoy\` decimal(10,2) DEFAULT NULL COMMENT 'Transaction count year-over-year growth(%)',
      \`txns_qoq\` decimal(10,2) DEFAULT NULL COMMENT 'Transaction count quarter-over-quarter growth(%)',
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`) USING BTREE,
      UNIQUE KEY \`unique_daily_stats\` (\`token_id\`,\`date\`)
    ) ENGINE=InnoDB AUTO_INCREMENT=122605 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Token daily stats';

    DROP TABLE IF EXISTS \`fact_token_monthly_stats\`;
    CREATE TABLE \`fact_token_monthly_stats\` (
      \`id\` bigint NOT NULL AUTO_INCREMENT,
      \`token_id\` int NOT NULL COMMENT 'Token ID',
      \`date\` date NOT NULL COMMENT 'Date',
      \`volume\` decimal(65,18) NOT NULL COMMENT 'Volume',
      \`volume_usd\` decimal(65,18) NOT NULL COMMENT 'USD volume',
      \`txns_count\` int NOT NULL COMMENT 'Transaction count',
      \`price_usd\` decimal(36,18) NOT NULL COMMENT 'USD price',
      \`volume_yoy\` decimal(65,18) DEFAULT NULL COMMENT 'Volume year-over-year growth(%)',
      \`volume_qoq\` decimal(65,18) DEFAULT NULL COMMENT 'Volume quarter-over-quarter growth(%)',
      \`txns_yoy\` decimal(10,2) DEFAULT NULL COMMENT 'Transaction count year-over-year growth(%)',
      \`txns_qoq\` decimal(10,2) DEFAULT NULL COMMENT 'Transaction count quarter-over-quarter growth(%)',
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`) USING BTREE,
      UNIQUE KEY \`unique_monthly_stats\` (\`token_id\`,\`date\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Token monthly stats';

    DROP TABLE IF EXISTS \`fact_token_weekly_stats\`;
    CREATE TABLE \`fact_token_weekly_stats\` (
      \`id\` bigint NOT NULL AUTO_INCREMENT,
      \`token_id\` int NOT NULL COMMENT 'Token ID',
      \`date\` date NOT NULL COMMENT 'Date',
      \`volume\` decimal(65,18) NOT NULL COMMENT 'Volume',
      \`volume_usd\` decimal(65,18) NOT NULL COMMENT 'USD volume',
      \`txns_count\` int NOT NULL COMMENT 'Transaction count',
      \`price_usd\` decimal(36,18) NOT NULL COMMENT 'USD price',
      \`volume_yoy\` decimal(65,18) DEFAULT NULL COMMENT 'Volume year-over-year growth(%)',
      \`volume_qoq\` decimal(65,18) DEFAULT NULL COMMENT 'Volume quarter-over-quarter growth(%)',
      \`txns_yoy\` decimal(10,2) DEFAULT NULL COMMENT 'Transaction count year-over-year growth(%)',
      \`txns_qoq\` decimal(10,2) DEFAULT NULL COMMENT 'Transaction count quarter-over-quarter growth(%)',
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`) USING BTREE,
      UNIQUE KEY \`unique_weekly_stats\` (\`token_id\`,\`date\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Token weekly stats';

    DROP TABLE IF EXISTS \`fact_token_yearly_stats\`;
    CREATE TABLE \`fact_token_yearly_stats\` (
      \`id\` bigint NOT NULL AUTO_INCREMENT,
      \`token_id\` int NOT NULL COMMENT 'Token ID',
      \`date\` date NOT NULL COMMENT 'Date',
      \`volume\` decimal(65,18) NOT NULL COMMENT 'Volume',
      \`volume_usd\` decimal(65,18) NOT NULL COMMENT 'USD volume',
      \`txns_count\` int NOT NULL COMMENT 'Transaction count',
      \`price_usd\` decimal(36,18) NOT NULL COMMENT 'USD price',
      \`volume_yoy\` decimal(65,18) DEFAULT NULL COMMENT 'Volume year-over-year growth(%)',
      \`volume_qoq\` decimal(65,18) DEFAULT NULL COMMENT 'Volume quarter-over-quarter growth(%)',
      \`txns_yoy\` decimal(10,2) DEFAULT NULL COMMENT 'Transaction count year-over-year growth(%)',
      \`txns_qoq\` decimal(10,2) DEFAULT NULL COMMENT 'Transaction count quarter-over-quarter growth(%)',
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`) USING BTREE,
      UNIQUE KEY \`unique_yearly_stats\` (\`token_id\`,\`date\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Token yearly stats';

    DROP TABLE IF EXISTS \`fact_yield_stats\`;
    CREATE TABLE \`fact_yield_stats\` (
      \`id\` bigint NOT NULL AUTO_INCREMENT COMMENT 'Primary key ID',
      \`token_id\` int NOT NULL COMMENT 'Token ID',
      \`return_type_id\` int NOT NULL COMMENT 'Return type ID',
      \`pool_address\` varchar(42) NOT NULL COMMENT 'Pool address',
      \`date\` date NOT NULL COMMENT 'Statistics date',
      \`apy\` decimal(10,2) NOT NULL COMMENT 'Annual percentage yield(%)',
      \`tvl\` decimal(65,18) NOT NULL COMMENT 'Total value locked(native token)',
      \`tvl_usd\` decimal(65,18) NOT NULL COMMENT 'Total value locked(USD)',
      \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time',
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`unique_daily_yield\` (\`token_id\`,\`pool_address\`,\`date\`)
    ) ENGINE=InnoDB AUTO_INCREMENT=118056 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Yield statistics fact table';
  `;
  await executeSqlFile(datasource, 'transform', sql);
  logger.info('Transform tables created successfully');
}
