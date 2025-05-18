import { DataSource } from 'typeorm';
import { BatchLog } from '../entities/BatchLog';

export const batchDataSource = new DataSource({
  type: 'mysql',
  host: process.env.BATCH_DB_HOST,
  port: parseInt(process.env.BATCH_DB_PORT || '3306'),
  username: process.env.BATCH_DB_USER,
  password: process.env.BATCH_DB_PASSWORD,
  database: process.env.BATCH_DB_NAME,
  entities: [BatchLog],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
