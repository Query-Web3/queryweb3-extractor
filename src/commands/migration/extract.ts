import { DataSource } from 'typeorm';
import { executeSqlFile } from './database';

import { Logger } from '../../utils/logger';
const logger = Logger.getInstance();

export async function migrateExtract(datasource: DataSource) {
  const sql = `
    -- acala.sql
    DROP TABLE IF EXISTS \`acala_block\`;
    CREATE TABLE IF NOT EXISTS \`acala_block\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`number\` int(11) NOT NULL,
      \`hash\` varchar(191) NOT NULL,
      \`timestamp\` datetime(3) NOT NULL DEFAULT current_timestamp(3),
      \`batchId\` char(36) NOT NULL,
      \`acala_data\` json DEFAULT NULL,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    DROP TABLE IF EXISTS \`acala_event\`;
    CREATE TABLE IF NOT EXISTS \`acala_event\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`blockId\` int(11) NOT NULL,
      \`extrinsicId\` int(11) DEFAULT NULL,
      \`index\` int(11) NOT NULL,
      \`section\` varchar(191) NOT NULL,
      \`method\` varchar(191) NOT NULL,
      \`data\` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(\`data\`)),
      \`batchId\` char(36) NOT NULL,
      PRIMARY KEY (\`id\`),
      KEY \`acala_event_blockId_fkey\` (\`blockId\`),
      KEY \`acala_event_extrinsicId_fkey\` (\`extrinsicId\`)
    ) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    DROP TABLE IF EXISTS \`acala_extrinsic\`;
    CREATE TABLE IF NOT EXISTS \`acala_extrinsic\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`blockId\` int(11) NOT NULL,
      \`index\` int(11) NOT NULL,
      \`method\` text NOT NULL,
      \`signer\` varchar(191) DEFAULT NULL,
      \`fee\` varchar(191) DEFAULT NULL,
      \`status\` varchar(191) DEFAULT NULL,
      \`params\` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(\`params\`)),
      \`batchId\` char(36) NOT NULL,
      PRIMARY KEY (\`id\`),
      KEY \`acala_extrinsic_blockId_fkey\` (\`blockId\`)
    ) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- bifrost.sql
    CREATE TABLE IF NOT EXISTS Bifrost_site_table (
      auto_id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Auto increment primary key',
      batch_id INT NOT NULL COMMENT 'Batch ID',
      Asset VARCHAR(255) COMMENT 'Asset name',
      Value DECIMAL(20,3) COMMENT 'Asset value',
      tvl DECIMAL(20,6) COMMENT 'Total value locked',
      tvm DECIMAL(20,6) COMMENT 'Total value managed',
      holders INT COMMENT 'Number of holders',
      apy DECIMAL(20,6) COMMENT 'Annual percentage yield',
      apyBase DECIMAL(20,6) COMMENT 'Base annual percentage yield',
      apyReward DECIMAL(20,6) COMMENT 'Reward annual percentage yield',
      totalIssuance DECIMAL(20,6) COMMENT 'Total token issuance',
      holdersList TEXT COMMENT 'List of holders',
      annualized_income DECIMAL(20,6) COMMENT 'Annualized income',
      bifrost_staking_7day_apy DECIMAL(20,6) COMMENT '7-day staking APY',
      created DATETIME COMMENT 'Creation time',
      daily_reward DECIMAL(20,6) COMMENT 'Daily reward amount',
      exited_node INT COMMENT 'Number of exited nodes',
      exited_not_transferred_node INT COMMENT 'Number of exited but not transferred nodes',
      exiting_online_node INT COMMENT 'Number of exiting online nodes',
      gas_fee_income DECIMAL(20,6) COMMENT 'Gas fee income',
      id INT COMMENT 'Internal ID',
      mev_7day_apy DECIMAL(20,6) COMMENT '7-day MEV APY',
      mev_apy DECIMAL(20,6) COMMENT 'MEV APY',
      mev_income DECIMAL(20,6) COMMENT 'MEV income',
      online_node INT COMMENT 'Number of online nodes',
      slash_balance DECIMAL(20,6) COMMENT 'Slashed balance',
      slash_num INT COMMENT 'Number of slashes',
      staking_apy DECIMAL(20,6) COMMENT 'Staking APY',
      staking_income DECIMAL(20,6) COMMENT 'Staking income',
      total_apy DECIMAL(20,6) COMMENT 'Total APY',
      total_balance DECIMAL(20,6) COMMENT 'Total balance',
      total_effective_balance DECIMAL(20,6) COMMENT 'Total effective balance',
      total_node INT COMMENT 'Total number of nodes',
      total_reward DECIMAL(20,6) COMMENT 'Total reward',
      total_withdrawals DECIMAL(20,6) COMMENT 'Total withdrawals',
      stakingApy DECIMAL(20,6) COMMENT 'Staking APY (alternative)',
      stakingIncome DECIMAL(20,6) COMMENT 'Staking income (alternative)',
      mevApy DECIMAL(20,6) COMMENT 'MEV APY (alternative)',
      mevIncome DECIMAL(20,6) COMMENT 'MEV income (alternative)',
      gasFeeApy DECIMAL(20,6) COMMENT 'Gas fee APY',
      gasFeeIncome DECIMAL(20,6) COMMENT 'Gas fee income',
      totalApy DECIMAL(20,6) COMMENT 'Total APY (alternative)',
      totalIncome DECIMAL(20,6) COMMENT 'Total income (alternative)',
      baseApy DECIMAL(20,6) COMMENT 'Base APY',
      farmingAPY DECIMAL(20,6) COMMENT 'Farming APY',
      veth2TVS DECIMAL(20,6) COMMENT 'vETH2 TVS',
      apyMev DECIMAL(20,6) COMMENT 'MEV APY (alternative)',
      apyGas DECIMAL(20,6) COMMENT 'Gas APY',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Bifrost_staking_table (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Auto increment primary key',
      batch_id INT NOT NULL COMMENT 'Batch ID',
      contractAddress VARCHAR(255) COMMENT 'Contract address',
      symbol VARCHAR(50) COMMENT 'Token symbol',
      slug VARCHAR(100) COMMENT 'Token slug',
      baseSlug VARCHAR(100) COMMENT 'Base token slug',
      unstakingTime INT COMMENT 'Unstaking period in days',
      users INT COMMENT 'Number of users',
      apr DECIMAL(20,6) COMMENT 'Annual percentage rate',
      fee DECIMAL(20,6) COMMENT 'Transaction fee',
      price DECIMAL(20,6) COMMENT 'Token price',
      exchangeRatio DECIMAL(20,6) COMMENT 'Exchange ratio',
      supply DECIMAL(20,6) COMMENT 'Token supply',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Bifrost_batchID_table (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Auto increment primary key',
      batch_id INT NOT NULL COMMENT 'Batch ID',
      chain VARCHAR(25) COMMENT 'Chain name',
      status VARCHAR(10) COMMENT 'Batch status',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- hydration.sql
    CREATE TABLE IF NOT EXISTS hydration_data (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Auto increment primary key',
      batch_id INT NOT NULL COMMENT 'Batch ID',
      asset_id VARCHAR(50) COMMENT 'Asset ID',
      symbol VARCHAR(50) COMMENT 'Asset symbol',
      farm_apr DOUBLE COMMENT 'Farm APR',
      pool_apr DOUBLE COMMENT 'Pool APR',
      total_apr DOUBLE COMMENT 'Total APR',
      tvl_usd DOUBLE COMMENT 'Total value locked in USD',
      volume_usd DOUBLE COMMENT 'Trading volume in USD',
      timestamp VARCHAR(50) COMMENT 'Data timestamp',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- stellswap.sql
    CREATE TABLE IF NOT EXISTS pool_data (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Auto increment primary key',
      batch_id INT NOT NULL COMMENT 'Batch ID',
      pool_id VARCHAR(255) COMMENT 'Pool ID',
      token0_id VARCHAR(255) COMMENT 'Token 0 ID',
      token0_symbol VARCHAR(50) COMMENT 'Token 0 symbol',
      token0_name VARCHAR(255) COMMENT 'Token 0 name',
      token0_decimals INT COMMENT 'Token 0 decimals',
      token1_id VARCHAR(255) COMMENT 'Token 1 ID',
      token1_symbol VARCHAR(50) COMMENT 'Token 1 symbol',
      token1_name VARCHAR(255) COMMENT 'Token 1 name',
      token1_decimals INT COMMENT 'Token 1 decimals',
      liquidity DOUBLE COMMENT 'Pool liquidity',
      sqrt_price DOUBLE COMMENT 'Square root price',
      tick INT COMMENT 'Current tick',
      volume_usd_current DOUBLE COMMENT 'Current volume in USD',
      volume_usd_24h_ago DOUBLE COMMENT '24h ago volume in USD',
      volume_usd_24h DOUBLE COMMENT '24h volume in USD',
      tx_count INT COMMENT 'Transaction count',
      fees_usd_current DOUBLE COMMENT 'Current fees in USD',
      fees_usd_24h_ago DOUBLE COMMENT '24h ago fees in USD',
      fees_usd_24h DOUBLE COMMENT '24h fees in USD',
      amount_token0 DOUBLE COMMENT 'Token 0 amount',
      amount_token1 DOUBLE COMMENT 'Token 1 amount',
      pools_apr DOUBLE COMMENT 'Pool APR',
      farming_apr DOUBLE COMMENT 'Farming APR',
      final_apr DOUBLE COMMENT 'Final APR',
      token_rewards TEXT COMMENT 'Token rewards details',
      timestamp VARCHAR(50) COMMENT 'Data timestamp',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await executeSqlFile(datasource, 'extract', sql);
  logger.info('Extract tables created successfully');
}
