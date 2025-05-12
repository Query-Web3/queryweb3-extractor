import { v4 as uuidv4 } from 'uuid';
import { BatchLog, BatchStatus, BatchType } from '../../entities/BatchLog';
import { extractData } from './main';
import { initializeDataSource } from './dataSource';

const EXTRACT_INTERVAL_MS = process.env.EXTRACT_INTERVAL_MS ? Number(process.env.EXTRACT_INTERVAL_MS) : 3600000;

/**
 * Continuously runs the data extraction process at specified intervals.
 * Creates a new batch log for each extraction attempt, updates its status upon success or failure,
 * and retries the extraction if it fails.
 */
export async function runExtract(options?: {startBlock?: number, endBlock?: number}) {
    // Infinite loop to ensure the extraction process runs continuously
    while (true) {
        const {startBlock, endBlock} = options || {};
        // Variable to hold the batch log record created for each extraction attempt
        let batchLog;
        try {
            // Create a new batch log record in the database with a unique batch ID and set its status to RUNNING
            const batchLogRepo = (await initializeDataSource()).getRepository(BatchLog);
            batchLog = await batchLogRepo.save(batchLogRepo.create({
                batchId: uuidv4(),
                status: BatchStatus.RUNNING,
                type: BatchType.EXTRACT
            }));
            
            // Call the extractData function with the created batch log to start the data extraction process
            const result = await extractData(batchLog, startBlock, endBlock);
            
            // Update processed block count and last height after successful extraction
            await (await initializeDataSource()).getRepository(BatchLog).update(batchLog.id, {
                processed_block_count: result.processedCount,
                last_processed_height: result.lastProcessedHeight
            });
            
            // If processing historical blocks, exit after one run
            if (startBlock !== undefined && endBlock !== undefined) {
                break;
            }
        } catch (error) {
            // Log any errors that occur during the extraction process
            console.error(error);
            
            // Check if a batch log was successfully created before attempting to update it
            if (batchLog) {
                const e = error instanceof Error ? error : new Error(String(error));
                const isConnectionError = e.message.includes('WebSocket is not connected');
                
                if (isConnectionError && batchLog.retryCount < 10) {
                    // For connection errors, set to PAUSED and retry after delay
                    await (await initializeDataSource()).getRepository(BatchLog).update(batchLog.id, {
                        status: BatchStatus.PAUSED,
                        retryCount: batchLog.retryCount + 1,
                        errorDetails: e.message
                    });
                    
                    console.log(`Connection error detected, pausing batch (retry ${batchLog.retryCount + 1}/10)`);
                    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds before retry
                    continue; // Restart the loop to retry
                } else {
                    // For other errors or max retries reached, set to FAILED
                    await (await initializeDataSource()).getRepository(BatchLog).update(batchLog.id, {
                        endTime: new Date(),
                        status: isConnectionError ? BatchStatus.FAILED : BatchStatus.FAILED,
                        retryCount: batchLog.retryCount + 1,
                        errorDetails: e.message
                    });
                    
                    if (isConnectionError) {
                        console.error(`Failed after 10 connection retries, exiting`);
                        process.exit(1);
                    }
                }
            }
        }
        // Log the time to wait before starting the next extraction batch
        console.log(`Wait for ${EXTRACT_INTERVAL_MS / 3600000} hours to run next batch...`);
        // Pause the execution for the specified interval before starting the next extraction batch
        await new Promise(resolve => setTimeout(resolve, EXTRACT_INTERVAL_MS));
    }
}
