import dotenv from 'dotenv';
dotenv.config();
import { Command } from 'commander';
import { runExtract } from './commands/extract';
import { transformData } from './commands/transform';
import { getBlockDetails } from './commands/block';
import { extractDataSource } from './datasources/extractDataSource';
import { transformDataSource } from './datasources/transformDataSource';

const program = new Command();

program
    .name('acala-data-extractor')
    .description('CLI for extracting and transforming Acala blockchain data')
    .version('0.3.0');

program.command('extract')
    .description('Extract raw data from Acala blockchain')
    .option('-s, --start-block <number>', 'Starting block number', parseInt)
    .option('-e, --end-block <number>', 'Ending block number', parseInt)
    .action(async (options) => {
        try {
            await runExtract({
                startBlock: options.startBlock,
                endBlock: options.endBlock
            });
        } finally {
            if (extractDataSource.isInitialized) {
                await extractDataSource.destroy();
            }
        }
    });

program.command('transform')
    .description('Transform extracted Acala data to DIM tables')
    .action(async () => {
        try {
            await transformData();
        } finally {
            if (transformDataSource.isInitialized) {
                await transformDataSource.destroy();
            }
        }
    });

program.command('block')
    .description('Show current blockchain details')
    .action(async () => {
        try {
            await extractDataSource.initialize();
            const details = await getBlockDetails();
            console.log('Blockchain Details:');
            console.log('Current Block:', details.currentBlock);
            console.log('Chain Stats:', details.chainStats);
            process.exit(0);
        } catch (err) {
            console.error('Error getting block details:', err);
            process.exit(1);
        } finally {
            if (extractDataSource.isInitialized) {
                await extractDataSource.destroy();
            }
        }
    });

program.parseAsync(process.argv).catch(async (err: Error) => {
    console.error(err);
    if (extractDataSource.isInitialized) await extractDataSource.destroy();
    if (transformDataSource.isInitialized) await transformDataSource.destroy();
    process.exit(1);
});
