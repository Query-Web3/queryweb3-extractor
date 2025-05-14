import { Command } from 'commander';
import { transformData, showLastTransformBatchLog, pauseTransformBatch, resumeTransformBatch } from './main';
import { transformDataSource } from '../../datasources/transformDataSource';

export function registerTransformCommand(program: Command) {
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
}
