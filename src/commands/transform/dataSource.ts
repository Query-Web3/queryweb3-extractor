import { DataSource } from 'typeorm';
import { transformDataSource } from '../../datasources/transformDataSource';
import { Logger } from '../../utils/logger';

let dataSource: DataSource;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

export async function initializeDataSource() {
  const logger = Logger.getInstance();
  
  if (dataSource?.isInitialized) {
    return dataSource;
  }

  dataSource = transformDataSource;
  let retryCount = 0;
  
  while (retryCount < MAX_RETRIES) {
    try {
      logger.info(`Initializing database connection (attempt ${retryCount + 1})`);
      await dataSource.initialize();
      logger.info('Database connection established');
      return dataSource;
    } catch (error) {
      retryCount++;
      logger.error(`Database connection failed (attempt ${retryCount}):`, error instanceof Error ? error : new Error(String(error)));
      
      if (retryCount < MAX_RETRIES) {
        logger.info(`Retrying in ${RETRY_DELAY_MS/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        throw new Error(`Failed to initialize database after ${MAX_RETRIES} attempts`);
      }
    }
  }
  
  return dataSource;
}

export function getDataSource() {
  if (!dataSource?.isInitialized) {
    throw new Error('Database connection not initialized');
  }
  return dataSource;
}
