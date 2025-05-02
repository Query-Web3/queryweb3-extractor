import { DataSource } from 'typeorm';
import { extractDataSource } from '../../datasources/extractDataSource';

// Initialize data source
let dataSource: DataSource;

/**
 * Initializes and returns the data source for extraction
 */
export async function initializeDataSource() {
  if (!dataSource?.isInitialized) {
    dataSource = extractDataSource;
    await dataSource.initialize();
  }
  return dataSource;
}
