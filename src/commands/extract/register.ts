import { Command } from 'commander';
import { extractData, showLastExtractBatchLog, pauseExtractBatch, resumeExtractBatch } from './main';
import { extractDataSource } from '../../datasources/extractDataSource';

export function registerExtractCommand(program: Command) {
    program.command('extract')
        .description('Extract raw data from Acala blockchain')
        .option('-s, --start-block <number>', 'Starting block number', parseInt)
        .option('-e, --end-block <number>', 'Ending block number', parseInt)
        .option('-t, --time-range <string>', 'Time range (e.g. 2h, 3d, 1w, 1m, 1y)')
        .option('-b, --batchlog', 'Show last extract batchlog record')
        .option('-r, --resume', 'Resume non-SUCCESS extract batch')
        .option('-p, --pause <batchlogId>', 'Pause running batch by ID', parseInt)
        .action(async (options) => {
            const startTime = Date.now();
            try {
                if (options.batchlog) {
                    try {
                        await showLastExtractBatchLog();
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
                        const batchLog = await pauseExtractBatch(options.pause);
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
                        const unfinishedLog = await resumeExtractBatch();
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

                await extractData(undefined, options.startBlock, options.endBlock);
            } finally {
                if (extractDataSource.isInitialized) {
                    await extractDataSource.destroy();
                }
                const totalTime = Date.now() - startTime;
                console.log(`Extract command completed in ${(totalTime / 1000).toFixed(2)} seconds`);
            }
        });
}
