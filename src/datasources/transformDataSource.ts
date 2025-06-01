import { DataSource } from 'typeorm';
import { Logger, LogLevel } from '../utils/logger';
import { DimChain } from '../entities/DimChain';
import { DimAssetType } from '../entities/DimAssetType';
import { DimReturnType } from '../entities/DimReturnType';
import { DimToken } from '../entities/DimToken';
import { DimStatCycle } from '../entities/DimStatCycle';
import { BatchLog } from '../entities/BatchLog';
import { FactTokenDailyStat } from '../entities/FactTokenDailyStat';
import { FactTokenMonthlyStat } from '../entities/FactTokenMonthlyStat';
import { FactTokenWeeklyStat } from '../entities/FactTokenWeeklyStat';
import { FactTokenYearlyStat } from '../entities/FactTokenYearlyStat';
import { FactYieldStat } from '../entities/FactYieldStat';
import { AcalaExtrinsic } from '../entities/acala/AcalaExtrinsic';
import { AcalaBlock } from '../entities/acala/AcalaBlock';
import { AcalaEvent } from '../entities/acala/AcalaEvent';

let logger: Logger;

function getLogger() {
    if (!logger) {
        logger = Logger.getInstance();
        logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    }
    return logger;
}

export const transformDataSource = new DataSource({
  type: 'mysql',
  host: process.env.TRANSFORM_DB_HOST,
  port: parseInt(process.env.TRANSFORM_DB_PORT || '3306'),
  username: process.env.TRANSFORM_DB_USER,
  password: process.env.TRANSFORM_DB_PASSWORD,
  database: process.env.TRANSFORM_DB_NAME,
  entities: [
    DimChain,
    DimAssetType,
    DimReturnType,
    DimToken,
    DimStatCycle,
    FactTokenDailyStat,
    FactTokenMonthlyStat,
    FactTokenWeeklyStat,
    FactTokenYearlyStat,
    FactYieldStat,
    AcalaExtrinsic,
    AcalaBlock,
    AcalaEvent,
    BatchLog
  ],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  poolSize: 5,  // 减少连接池大小以避免资源竞争
  extra: {
    connectionLimit: 10,
    idleTimeout: 60000,  // 延长空闲超时
    connectTimeout: 60000,  // 延长连接超时
    acquireTimeout: 60000,  // 延长获取连接超时
    enableKeepAlive: true,  // 启用保活
    keepAliveInitialDelay: 30000  // 保活间隔
  },
  migrations: [],
  subscribers: [],
  migrationsRun: false,
  logger: {
    logQuery: (query: string, parameters?: any[]) => {
      getLogger().debug(`Executing query: ${query}`, {parameters});
    },
    logQueryError: (error: string, query: string, parameters?: any[]) => {
      getLogger().error(`Query failed: ${error}\nQuery: ${query}\nParameters: ${JSON.stringify(parameters)}`);
    },
    logQuerySlow: (time: number, query: string, parameters?: any[]) => {
      getLogger().warn(`Slow query (${time}ms): ${query}`, {parameters});
    },
    logSchemaBuild: (message: string) => {
      getLogger().debug(`Schema build: ${message}`);
    },
    logMigration: (message: string) => {
      getLogger().info(`Migration: ${message}`);
    },
    log: (level: 'log'|'info'|'warn', message: any) => {
      switch(level) {
        case 'log': getLogger().debug(message); break;
        case 'info': getLogger().info(message); break;
        case 'warn': getLogger().warn(message); break;
      }
    }
  }
});
