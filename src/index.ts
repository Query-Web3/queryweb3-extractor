import dotenv from 'dotenv';
dotenv.config();
import { Command } from 'commander';
import { extractData, showLastBatchLog, pauseBatch, resumeBatch } from './commands/extract';
import { transformData, showLastTransformBatchLog, pauseTransformBatch, resumeTransformBatch } from './commands/transform';
import { getBlockDetails } from './commands/block/main';
import { extractDataSource } from './datasources/extractDataSource';
import { transformDataSource } from './datasources/transformDataSource';

// Create a new instance of the Command class
const program = new Command();

// Set the name of the CLI tool
program
    .name('acala-data-extractor')
    // Set the description of the CLI tool
    .description('CLI for extracting and transforming Acala blockchain data')
    // Set the version of the CLI tool
    .version('0.3.0');

// Define a new 'extract' command
program.command('extract')
    .description('Extract raw data from Acala blockchain')
    .option('-s, --start-block <number>', 'Starting block number', parseInt)
    .option('-e, --end-block <number>', 'Ending block number', parseInt)
    .option('-t, --time-range <string>', 'Time range (e.g. 2h, 3d, 1w, 1m, 1y)')
    .option('-b, --batchlog', 'Show last extract batchlog record')
    .option('-r, --resume', 'Resume non-SUCCESS extract batch')
    .option('-p, --pause <batchlogId>', 'Pause running batch by ID', parseInt)
    .action(async (options) => {
        // Record the start time of the extraction process
        const startTime = Date.now();
        try {
            // Check if the 'batchlog' option is provided
            if (options.batchlog) {
                try {
                    // Show the last extract batch log record
                    await showLastBatchLog();
                } catch (err: unknown) {
                    // Handle errors when fetching the batch log
                    if (err instanceof Error) {
                        console.error('Error fetching batchlog:', err.message);
                    } else {
                        console.error('Unknown error fetching batchlog');
                    }
                } finally {
                    // Exit the process after showing the batch log
                    process.exit(0);
                }
                return;
            }

            // Check if the 'pause' option is provided
            if (options.pause) {
                try {
                    // Pause the running batch with the specified ID
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
                    // Log a message indicating that the extract batch is being resumed
                    console.log(`Resuming extract batch ${unfinishedLog.batchId}`);
                    // Call the extractData function to resume data extraction with the unfinished batch log
                    // and the start and end block numbers provided via command-line options
                    await extractData(unfinishedLog, options.startBlock, options.endBlock);
                } catch (err: unknown) {
                    // Check if the error is an instance of the Error class
                    if (err instanceof Error) {
                        // Log an error message with the error details if it's an Error instance
                        console.error('Error resuming batch:', err.message);
                    } else {
                        // Log a generic error message if the error type is unknown
                        console.error('Unknown error resuming batch');
                    }
                    // Exit the process with a non-zero status code to indicate an error occurred
                    process.exit(1);
                }
                // Return from the function to prevent further execution
                return;
            }

            // Call the extractData function to start a new data extraction process
            // with no existing batch log and the start and end block numbers provided via command-line options
            await extractData(undefined, options.startBlock, options.endBlock);
        } finally {
            // Check if the extract data source is initialized
            if (extractDataSource.isInitialized) {
                // Destroy the extract data source if it's initialized
                await extractDataSource.destroy();
            }
            // Calculate the total time taken for the extract command to complete
            const totalTime = Date.now() - startTime;
            // Log a message indicating the time taken for the extract command to complete
            console.log(`Extract command completed in ${(totalTime / 1000).toFixed(2)} seconds`);
        }
    });

    program.command('transform')
        .description('Transform extracted Acala data to DIM tables')
        .option('-b, --batchlog', 'Show last transform batchlog record')
        .option('-r, --resume', 'Resume non-SUCCESS transform batch')
        .option('-p, --pause <batchlogId>', 'Pause running transform batch by ID', parseInt)
        .action(async (options) => {
            try {
                // Check if the 'batchlog' option is provided
                if (options.batchlog) {
                    try {
                        // Show the last transform batch log record
                        await showLastTransformBatchLog();
                    } catch (err: unknown) {
                        // Check if the error is an instance of the Error class
                        if (err instanceof Error) {
                            // Log an error message with the error details if it's an Error instance
                            console.error('Error fetching batchlog:', err.message);
                        } else {
                            // Log a generic error message if the error type is unknown
                            console.error('Unknown error fetching batchlog');
                        }
                    } finally {
                        // Exit the process after showing the batch log
                        process.exit(0);
                    }
                    // Return from the function to prevent further execution
                    return;
                }

                // Check if the 'pause' option is provided
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
    .option('-t, --time-range <string>', 'Time range (e.g. 2h, 3d, 1w, 1m, 1y)')
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
