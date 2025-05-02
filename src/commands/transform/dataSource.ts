import { DataSource } from 'typeorm';
import { transformDataSource } from '../../datasources/transformDataSource';

let dataSource: DataSource;

export async function initializeDataSource() {
  if (!dataSource?.isInitialized) {
    dataSource = transformDataSource;
    await dataSource.initialize();
  }
  return dataSource;
}
