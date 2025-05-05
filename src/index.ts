import dotenv from 'dotenv';
dotenv.config();
import { Command } from 'commander';
import { extractData } from './commands/extract';
import { transformData } from './commands/transform';
import { getBlockDetails } from './commands/block/main';
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
    .option('-t, --time-range <string>', 'Time range (e.g. 2d, 3w, 1m, 1y)')
    .action(async (options) => {
        try {
            // TODO: 需要提供有效的batchLog参数
            await extractData({
                id: 0,
                batchId: 'cli-' + Date.now()
            }, options.startBlock, options.endBlock);
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
    .option('-t, --time-range <string>', 'Time range (e.g. 2d, 3w, 1m, 1y)')
    .action(async (options) => {
        try {
            await extractDataSource.initialize();
            const details = await getBlockDetails(options.timeRange);
            console.log('Blockchain Details:');
            
            if ('blocks' in details) {
                // Time range query results
                console.log(`Blocks in time range ${details.timeRange} (${details.fromBlock} to ${details.toBlock}):`);
                details.blocks.forEach(block => {
                    console.log(`- Block #${block.number}:`);
                    console.log(`  Hash: ${block.hash}`);
                    console.log(`  Timestamp: ${block.timestamp}`);
                    console.log(`  Parent Hash: ${block.parentHash}`);
                });
            } else {
                // Single block query results
                console.log('Current Block:', details.currentBlock);
                console.log('Chain Stats:', details.chainStats);
            }
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
