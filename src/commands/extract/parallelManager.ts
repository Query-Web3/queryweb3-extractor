import os from 'os';
import { initializeDataSource } from './dataSource';
import { AcalaBlock } from '../../entities/acala/AcalaBlock';
import { AcalaProcessor } from './acala/AcalaProcessor';

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
    try {
        const processor = new AcalaProcessor();
        processor.setApi(api);
        processor.setBatchId(batchId);
        
        console.log(`Processing chunk of ${chunk.length} blocks (${chunk[0].number} to ${chunk[chunk.length-1].number})`);
        
        // Process all blocks in current group
        await processor.saveData(chunk);
        
        return chunk.length;
    } catch (e) {
        console.error('Failed to process chunk:', e);
        return 0;
    }
}
