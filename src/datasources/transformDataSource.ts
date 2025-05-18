import { DataSource } from 'typeorm';
import { DimChain } from '../entities/DimChain';
import { DimAssetType } from '../entities/DimAssetType';
import { DimReturnType } from '../entities/DimReturnType';
import { DimToken } from '../entities/DimToken';
import { DimStatCycle } from '../entities/DimStatCycle';
import { FactTokenDailyStat } from '../entities/FactTokenDailyStat';
import { FactTokenMonthlyStat } from '../entities/FactTokenMonthlyStat';
import { FactTokenWeeklyStat } from '../entities/FactTokenWeeklyStat';
import { FactTokenYearlyStat } from '../entities/FactTokenYearlyStat';
import { FactYieldStat } from '../entities/FactYieldStat';
import { AcalaExtrinsic } from '../entities/acala/AcalaExtrinsic';
import { AcalaBlock } from '../entities/acala/AcalaBlock';
import { AcalaEvent } from '../entities/acala/AcalaEvent';

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
    AcalaEvent
  ],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
