import dotenv from 'dotenv';
dotenv.config();
import { Command } from 'commander';
import { extractData, showLastBatchLog, pauseBatch, resumeBatch } from './commands/extract';
import { transformData, showLastTransformBatchLog, pauseTransformBatch, resumeTransformBatch } from './commands/transform';
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
    .option('-b, --batchlog', 'Show last extract batchlog record')
    .option('-r, --resume', 'Resume non-SUCCESS extract batch')
    .option('-p, --pause <batchlogId>', 'Pause running batch by ID', parseInt)
    .action(async (options) => {
        try {
            if (options.batchlog) {
                try {
                    await showLastBatchLog();
                } catch (err: unknown) {
                    if (err instanceof Error) {
                        console.error('Error fetching batchlog:', err.message);
                    } else {
                        console.error('Unknown error fetching batchlog');
                    }
                } finally {
                    process.exit(0);
                }
                return;
            }

            if (options.pause) {
                try {
                    const batchLog = await pauseBatch(options.pause);
                    console.log(`Batch ${batchLog.batchId} (ID: ${batchLog.id}) paused successfully`);
                } catch (err: unknown) {
                    if (err instanceof Error) {
                        console.error('Error pausing batch:', err.message);
                    } else {
                        console.error('Unknown error pausing batch');
                    }
                    process.exit(1);
                }
                return;
            }

            if (options.resume) {
                try {
                    const unfinishedLog = await resumeBatch();
                    console.log(`Resuming extract batch ${unfinishedLog.batchId}`);
                    await extractData(unfinishedLog, options.startBlock, options.endBlock);
                } catch (err: unknown) {
                    if (err instanceof Error) {
                        console.error('Error resuming batch:', err.message);
                    } else {
                        console.error('Unknown error resuming batch');
                    }
                    process.exit(1);
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
    .option('-b, --batchlog', 'Show last transform batchlog record')
    .option('-r, --resume', 'Resume non-SUCCESS transform batch')
    .option('-p, --pause <batchlogId>', 'Pause running transform batch by ID', parseInt)
    .action(async (options) => {
        try {
            if (options.batchlog) {
                try {
                    await showLastTransformBatchLog();
                } catch (err: unknown) {
                    if (err instanceof Error) {
                        console.error('Error fetching batchlog:', err.message);
                    } else {
                        console.error('Unknown error fetching batchlog');
                    }
                } finally {
                    process.exit(0);
                }
                return;
            }

            if (options.pause) {
                try {
                    const batchLog = await pauseTransformBatch(options.pause);
                    console.log(`Transform batch ${batchLog.batchId} (ID: ${batchLog.id}) paused successfully`);
                } catch (err: unknown) {
                    if (err instanceof Error) {
                        console.error('Error pausing batch:', err.message);
                    } else {
                        console.error('Unknown error pausing batch');
                    }
                    process.exit(1);
                }
                return;
            }

            if (options.resume) {
                try {
                    const unfinishedLog = await resumeTransformBatch();
                    console.log(`Resuming transform batch ${unfinishedLog.batchId}`);
                    await transformData(unfinishedLog);
                } catch (err: unknown) {
                    if (err instanceof Error) {
                        console.error('Error resuming batch:', err.message);
                    } else {
                        console.error('Unknown error resuming batch');
                    }
                    process.exit(1);
                }
                return;
            }

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
