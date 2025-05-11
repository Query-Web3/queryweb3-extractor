import os from 'os';
import { initializeDataSource } from './dataSource';
import { processBlock } from './blockProcessor';
import { Block } from '../../entities/Block';

/**
 * Calculates optimal concurrency settings based on CPU cores
 */
export function getConcurrencySettings(totalBlocks?: number) {
    const cpuCount = os.cpus().length;
    const CONCURRENCY = Math.max(1, Math.floor(cpuCount / 2)); // Use at most half of CPU cores
    const CHUNK_SIZE = totalBlocks ? Math.max(1, Math.ceil(totalBlocks / CONCURRENCY)) : 100;
    console.log(`Using ${CONCURRENCY} parallel workers (${cpuCount} cores available), chunk size: ${CHUNK_SIZE}`);
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
    
    // Batch write sorted results to database
    if (sortedResults.length > 0) {
        try {
            const dataSource = await initializeDataSource();
            const blockRepository = dataSource.getRepository(Block);
            await blockRepository.insert(sortedResults);
            console.log(`Saved ${sortedResults.length} blocks to database`);
        } catch (e) {
            console.error('Failed to save blocks to database:', e);
        }
    }
    
    return successfulResults.length;
}
