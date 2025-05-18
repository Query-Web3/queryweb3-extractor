import dotenv from 'dotenv';
dotenv.config();
import { Command } from 'commander';
import { registerExtractCommand } from './commands/extract/register';
import { registerTransformCommand } from './commands/transform/register';
import { registerBlockCommand } from './commands/block/register';
import { registerTruncateCommand } from './commands/truncate/main';
import { registerMigrationCommand } from './commands/migration/register';
import { extractDataSource } from './datasources/extractDataSource';
import { transformDataSource } from './datasources/transformDataSource';

// Create a new instance of the Command class
const program = new Command();

// Set the name of the CLI tool
program
    .name('queryweb3-extractor')
    // Set the description of the CLI tool
    .description('CLI for extracting and transforming blockchain data')
    // Set the version of the CLI tool
    .version('0.5.0')
    .option('-c, --chain <string>', 'Specify chain name (acala, hydration, bifrost, stellswap)', 'acala');

registerExtractCommand(program);
registerTransformCommand(program);
registerBlockCommand(program);
registerTruncateCommand(program);
registerMigrationCommand(program);

program.parseAsync(process.argv).catch(async (err: Error) => {
    console.error(err);
    if (extractDataSource.isInitialized) await extractDataSource.destroy();
    if (transformDataSource.isInitialized) await transformDataSource.destroy();
    process.exit(1);
});

export { program };
