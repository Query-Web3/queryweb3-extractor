import { Command } from 'commander';
import { migrationAction } from './main';

export function registerMigrationCommand(program: Command) {
  program
    .command('migration')
    .description('Execute database migration')
    .option('--all', 'Create all databases and tables')
    .option('--batch', 'Create only batch database and tables')
    .option('--extract', 'Create only extract database and tables') 
    .option('--transform', 'Create only transform database and tables')
    .action(migrationAction);
}
