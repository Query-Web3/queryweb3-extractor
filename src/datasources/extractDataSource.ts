import { DataSource } from 'typeorm';
import { Block } from '../entities/Block';
import { Extrinsic } from '../entities/Extrinsic';
import { Event } from '../entities/Event';
import { BatchLog } from '../entities/BatchLog';

export const extractDataSource = new DataSource({
  type: 'mysql',
  host: process.env.EXTRACT_DB_HOST || process.env.DB_HOST,
  port: parseInt(process.env.EXTRACT_DB_PORT || process.env.DB_PORT || '3306'),
  username: process.env.EXTRACT_DB_USER || process.env.DB_USER,
  password: process.env.EXTRACT_DB_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.EXTRACT_DB_NAME || process.env.DB_NAME,
  entities: [Block, Extrinsic, Event, BatchLog],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
