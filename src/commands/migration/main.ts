import { DataSource } from 'typeorm';
import { extractDataSource } from '../../datasources/extractDataSource';
import { transformDataSource } from '../../datasources/transformDataSource';
import { Logger } from '../../utils/logger';
const logger = Logger.getInstance();
import { migrateBatch } from './batch';
import { migrateExtract } from './extract';
import { migrateTransform } from './transform';
import { promptForAdminCredentials } from './database';

export async function migrationAction(options: {
  all?: boolean;
  batch?: boolean;
  extract?: boolean;
  transform?: boolean;
}) {
  try {
    const { username, password } = await promptForAdminCredentials();
    process.env.DB_USERNAME = username;
    process.env.DB_PASSWORD = password;

    if (options.all) {
      await migrateBatch(extractDataSource);
      await migrateExtract(extractDataSource);
      await migrateTransform(transformDataSource);
    } else if (options.batch) {
      await migrateBatch(extractDataSource);
    } else if (options.extract) {
      await migrateExtract(extractDataSource);
    } else if (options.transform) {
      await migrateTransform(transformDataSource);
    } else {
      logger.info('Please specify migration option: --all, --batch, --extract or --transform');
    }
  } catch (err) {
    logger.error('Migration failed:', err instanceof Error ? err : new Error(String(err)));
    process.exit(1);
  }
}
