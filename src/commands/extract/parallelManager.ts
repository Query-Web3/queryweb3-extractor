import os from 'os';
import { initializeDataSource } from './dataSource';
import { processBlock } from './blockProcessor';
import { AcalaBlock } from '../../entities/acala/AcalaBlock';

/**
 * Calculates optimal concurrency settings based on CPU cores
 */
export function getConcurrencySettings(totalBlocks?: number, networkLatency?: number) {
    const cpuCount = os.cpus().length;
    const mem = process.memoryUsage();
    const memoryUsage = mem.heapUsed / mem.rss; // Use RSS instead of heapLimit
    
    // Base concurrency on CPU cores, adjusted by memory usage and network latency
    // Calculate base concurrency factor
    const baseConcurrency = cpuCount * (1 - Math.min(0.9, memoryUsage));
    
    // Apply network latency factor
    const latencyFactor = networkLatency ? Math.min(1, 500 / networkLatency) : 1;
    
    // Calculate final concurrency
    let CONCURRENCY = Math.max(1, Math.floor(baseConcurrency * latencyFactor));
    
    // Dynamic chunk size based on total blocks and concurrency
    const CHUNK_SIZE = totalBlocks ? 
        Math.max(10, Math.min(500, Math.ceil(totalBlocks / CONCURRENCY))) : 
        networkLatency ? Math.min(200, Math.max(50, Math.floor(200 / (networkLatency / 100)))) : 100;
    
    console.log(`Using ${CONCURRENCY} parallel workers (${cpuCount} cores, ${(memoryUsage*100).toFixed(1)}% mem used), chunk size: ${CHUNK_SIZE}`);
    return { CONCURRENCY, CHUNK_SIZE };
}

/**
 * Splits blocks into chunks for parallel processing
 * @param blocks - Array of blocks to process
 * @param chunkSize - Size of each chunk
 */
export function splitIntoChunks(blocks: any[], chunkSize: number) {
    const chunks = [];
    for (let i = 0; i < blocks.length; i += chunkSize) {
        chunks.push(blocks.slice(i, i + chunkSize));
    }
    return chunks;
}

/**
 * Processes a chunk of blocks in parallel
 * @param chunk - Array of blocks to process
 * @param api - Polkadot API instance
 * @param batchId - Unique batch ID for tracking
 */
export async function processChunk(
    chunk: Array<{
        number: number;
        hash: string;
        header: any;
        hashObj: any;
        acalaData?: {
            dexPools: Array<{
                poolId: string;
                liquidity: string;
            }>;
            stableCoinBalances: Array<{
                accountId: string;
                position: string;
            }>;
        };
    }>,
    api: any,
    batchId: string
) {
    console.log(`Processing chunk of ${chunk.length} blocks (${chunk[0].number} to ${chunk[chunk.length-1].number})`);
    
    // Progress tracking
    const progressMap = new Map<number, {current: number, total: number}>();
    let lastProgressUpdate = 0;
    
    // Assign unique ID to each worker
    let workerId = 0;
    
    // Process all blocks in current group in parallel
    const results = await Promise.all(chunk.map(block => {
        const currentWorkerId = workerId++;
        progressMap.set(currentWorkerId, {
            current: 0,
            total: chunk.length
        });
        
        return processBlock(block, currentWorkerId, api, batchId)
            .then(result => {
                // Update progress when completed
                const progress = progressMap.get(currentWorkerId);
                if (progress) {
                    progress.current++;
                    const currentBlock = block.number;
                    const startBlock = chunk[0].number;
                    const endBlock = chunk[chunk.length - 1].number;
                }
                return result;
            });
    }));

    // Filter out any failed results (where error exists) and ensure they have number property
    const successfulResults = results.filter(r => !r.error && typeof r.number === 'number');
    const failedCount = results.length - successfulResults.length;
    
    if (failedCount > 0) {
        console.warn(`Failed to process ${failedCount}/${chunk.length} blocks in current chunk`);
    }
    
    // Sort successful results by block number
    const sortedResults = successfulResults
        .sort((a, b) => {
            if (typeof a.number !== 'number' || typeof b.number !== 'number') return 0;
            return a.number - b.number;
        });
    
    // Batch write sorted results to database with buffering
    if (sortedResults.length > 0) {
        try {
            const dataSource = await initializeDataSource();
            const blockRepository = dataSource.getRepository(AcalaBlock);
            
            // Use bulk insert with batch size of 100
            const BATCH_SIZE = 100;
            for (let i = 0; i < sortedResults.length; i += BATCH_SIZE) {
                const batch = sortedResults.slice(i, i + BATCH_SIZE);
                await blockRepository.insert(batch);
                console.log(`Saved blocks ${batch[0].number} to ${batch[batch.length-1].number} (${batch.length} blocks)`);
            }
        } catch (e) {
            console.error('Failed to save blocks to database:', e);
        }
    }
    
    return successfulResults.length;
}
