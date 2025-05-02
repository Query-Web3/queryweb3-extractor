import os from 'os';
import { initializeDataSource } from './dataSource';
import { processBlock } from './blockProcessor';
import { Block } from '../../entities/Block';

/**
 * Calculates optimal concurrency settings based on CPU cores
 */
export function getConcurrencySettings() {
    const cpuCount = os.cpus().length;
    const CONCURRENCY = Math.max(1, Math.floor(cpuCount / 2)); // Use at most half of CPU cores
    const CHUNK_SIZE = Math.min(100, CONCURRENCY * 20); // Max 100 blocks per group or 20x CPU capacity
    console.log(`Using ${CONCURRENCY} parallel workers (${cpuCount} cores available)`);
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
    
    const updateProgress = () => {
        const now = Date.now();
        if (now - lastProgressUpdate < 1000) return; // Update once per second
        lastProgressUpdate = now;
        
        console.log('\nCurrent parallel processing progress:');
        progressMap.forEach((progress, workerId) => {
            const currentBlock = chunk[progress.current - 1]?.number || 0;
            const startBlock = chunk[0]?.number || 0;
            const endBlock = chunk[chunk.length - 1]?.number || 0;
            const blockProgress = Math.round((currentBlock - startBlock) / (endBlock - startBlock + 1) * 100);
            console.log(`Worker ${workerId}: Block ${currentBlock} (${blockProgress}%)`);
        });
        console.log('');
    };

    // Assign unique ID to each worker
    let workerId = 0;
    
    // Process all blocks in current group in parallel
    const results = await Promise.all(chunk.map(block => {
        const currentWorkerId = workerId++;
        progressMap.set(currentWorkerId, {
            current: 0,
            total: chunk.length
        });
        
        // Update progress display
        updateProgress();
        
        return processBlock(block, currentWorkerId, api, batchId)
            .then(result => {
                // Update progress when completed
                const progress = progressMap.get(currentWorkerId);
                if (progress) {
                    progress.current++;
                    updateProgress();
                    const currentBlock = block.number;
                    const startBlock = chunk[0].number;
                    const endBlock = chunk[chunk.length - 1].number;
                    const blockProgress = Math.round((currentBlock - startBlock) / (endBlock - startBlock + 1) * 100);
                    console.log(`Processed block ${currentBlock} (${blockProgress}%)`);
                }
                return result;
            });
    }));

    // Count successful results
    const successCount = results.filter((r: any) => r.success).length;
    console.log(`Processed ${successCount}/${chunk.length} blocks in current chunk`);
    return successCount;
}
