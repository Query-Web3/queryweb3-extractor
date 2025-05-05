import dotenv from 'dotenv';
dotenv.config();
import { Command } from 'commander';
import { extractData } from './commands/extract';
import { transformData } from './commands/transform';
import { getBlockDetails } from './commands/block/main';
import { extractDataSource } from './datasources/extractDataSource';
import { transformDataSource } from './datasources/transformDataSource';
import { BatchLog, BatchType, BatchStatus } from './entities/BatchLog';

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
    .option('-b, --batchlog', 'Show last extract batchlog record')
    .action(async (options) => {
        try {
            if (options.batchlog) {
                try {
                    if (!extractDataSource.isInitialized) {
                        await extractDataSource.initialize();
                    }
                    const batchLogRepo = extractDataSource.getRepository(BatchLog);
                    const lastLog = await batchLogRepo.findOne({
                        where: { type: BatchType.EXTRACT },
                        order: { startTime: 'DESC' }
                    });

                    if (lastLog) {
                        console.log('Last Extract BatchLog Record:');
                        console.log(`ID: ${lastLog.id}`);
                        console.log(`Batch ID: ${lastLog.batchId}`);
                        console.log(`Start Time: ${lastLog.startTime}`);
                        console.log(`End Time: ${lastLog.endTime || 'N/A'}`);
                        console.log(`Status: ${BatchStatus[lastLog.status]}`);
                        console.log(`Type: ${BatchType[lastLog.type]}`);
                        console.log(`Processed Blocks: ${lastLog.processed_block_count}`);
                        console.log(`Last Processed Height: ${lastLog.last_processed_height || 'N/A'}`);
                    } else {
                        console.log('No extract batchlog records found');
                    }
                } catch (err) {
                    console.error('Error fetching batchlog:', err);
                } finally {
                    process.exit(0);
                }
                return;
            }

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
    .action((options) => {
        (async () => {
            try {
                await extractDataSource.initialize();
                const details = await getBlockDetails(options.timeRange);
                console.log('Blockchain Details:');
                
                if ('firstBlock' in details) {
                    console.log('Block Range Query Results:');
                    console.log(`Time Range: ${details.timeRange}`);
                    console.log(`First Block: ${details.firstBlock.number}`);
                    console.log(`Latest Block: ${details.latestBlock}`);
                    console.log(`Block Difference: ${details.blockDiff}`);
                    console.log(`First Block Timestamp: ${details.firstBlock.timestamp}`);
                } else {
                    console.log('Current Block:', details.currentBlock);
                    console.log('Chain Stats:', details.chainStats);
                }
            } catch (err) {
                console.error('Error getting block details:', err);
            } finally {
                if (extractDataSource.isInitialized) {
                    await extractDataSource.destroy();
                }
                process.exit(0);
            }
        })();
    });

program.parseAsync(process.argv).catch(async (err: Error) => {
    console.error(err);
    if (extractDataSource.isInitialized) await extractDataSource.destroy();
    if (transformDataSource.isInitialized) await transformDataSource.destroy();
    process.exit(1);
});
