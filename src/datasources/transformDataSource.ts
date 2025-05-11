import { DataSource } from 'typeorm';
import { DimChain } from '../entities/DimChain';
import { DimAssetType } from '../entities/DimAssetType';
import { DimReturnType } from '../entities/DimReturnType';
import { DimToken } from '../entities/DimToken';
import { DimStatCycle } from '../entities/DimStatCycle';
import { FactTokenDailyStat } from '../entities/FactTokenDailyStat';
import { FactYieldStat } from '../entities/FactYieldStat';
import { BatchLog } from '../entities/BatchLog';
import { Extrinsic } from '../entities/Extrinsic';
import { Block } from '../entities/Block';
import { Event } from '../entities/Event';

export const transformDataSource = new DataSource({
  type: 'mysql',
  host: process.env.TRANSFORM_DB_HOST || process.env.DB_HOST,
  port: parseInt(process.env.TRANSFORM_DB_PORT || process.env.DB_PORT || '3306'),
  username: process.env.TRANSFORM_DB_USER || process.env.DB_USER,
  password: process.env.TRANSFORM_DB_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.TRANSFORM_DB_NAME || process.env.DB_NAME,
  entities: [
    DimChain,
    DimAssetType,
    DimReturnType,
    DimToken,
    DimStatCycle,
    FactTokenDailyStat,
    FactYieldStat,
    BatchLog,
    Extrinsic,
    Block,
    Event
  ],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
