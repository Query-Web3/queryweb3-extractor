import { DataSource } from 'typeorm';
import { AcalaBlock } from '../entities/acala/AcalaBlock';
import { AcalaExtrinsic } from '../entities/acala/AcalaExtrinsic';
import { AcalaEvent } from '../entities/acala/AcalaEvent';
export const extractDataSource = new DataSource({
  type: 'mysql',
  host: process.env.EXTRACT_DB_HOST,
  port: parseInt(process.env.EXTRACT_DB_PORT || '3306'),
  username: process.env.EXTRACT_DB_USER,
  password: process.env.EXTRACT_DB_PASSWORD,
  database: process.env.EXTRACT_DB_NAME,
  entities: [AcalaBlock, AcalaExtrinsic, AcalaEvent],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
