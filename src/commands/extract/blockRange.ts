import { DataSource } from 'typeorm';
import { AcalaBlock } from '../../entities/acala/AcalaBlock';
import { initializeDataSource } from './dataSource';
import { 
    parseTimeRange,
    createApi,
    disconnectApi,
    getLatestBlockNumber
} from '../../utils/blockTime';

export interface BlockRange {
    startBlock: number;
    endBlock: number;
    isHistorical: boolean;
}

// Cache for prefetched block hashes
const blockHashCache = new Map<number, string>();

export async function determineBlockRange(
    startBlock?: number, 
    endBlock?: number,
    timeRange?: string
): Promise<BlockRange> {
    let isHistorical = false;
    
    // Prefetch block hashes in background if range is known
    if (startBlock !== undefined && endBlock !== undefined) {
        const api = await createApi();
        const prefetchCount = Math.min(100, endBlock - startBlock);
        for (let i = 0; i < prefetchCount; i++) {
            const blockNum = startBlock + i;
            if (!blockHashCache.has(blockNum)) {
                api.rpc.chain.getBlockHash(blockNum)
                    .then(hash => blockHashCache.set(blockNum, hash.toString()))
                    .catch(() => {});
            }
        }
        await disconnectApi(api);
    }
    
    if (timeRange !== undefined) {
        const timeMs = parseTimeRange(timeRange);
        const now = Date.now();
        const targetTime = now - timeMs;
        
        const api = await createApi();
        
        // Get current block number and timestamp
        const header = await api.rpc.chain.getHeader();
        const latestBlock = header.number.toNumber();
        const latestTimestamp = parseInt((await api.query.timestamp.now()).toString());
        
        // Calculate dynamic average block time
        const sampleBlocks = 10; // Number of blocks to sample for average
        const sampleHeaders = await Promise.all(
            Array.from({length: sampleBlocks}, (_, i) => 
                api.rpc.chain.getBlockHash(Math.max(1, latestBlock - i - 1))
            )
        );
        const sampleTimestamps = await Promise.all(
            sampleHeaders.map(hash => 
                api.query.timestamp.now.at(hash)
            )
        );
        const blockTimes = [];
        for (let i = 1; i < sampleBlocks; i++) {
            const prevTimestamp = parseInt(sampleTimestamps[i-1].toString());
            const currTimestamp = parseInt(sampleTimestamps[i].toString());
            const timeDiff = prevTimestamp - currTimestamp;
            blockTimes.push(timeDiff);
        }
        const avgBlockTime = blockTimes.reduce((a, b) => a + b, 0) / blockTimes.length;
        
        // Calculate block number at target time
        const timeDiff = latestTimestamp - targetTime;
        const blocksDiff = Math.floor(timeDiff / avgBlockTime);
        startBlock = Math.max(0, latestBlock - blocksDiff);
        endBlock = latestBlock;
        
        await disconnectApi(api);
        console.log(`Processing time range ${timeRange} (blocks ${startBlock} to ${endBlock})`);
        return {
            startBlock,
            endBlock,
            isHistorical: true
        };
    } else if (startBlock !== undefined || endBlock !== undefined) {
        isHistorical = true;
        
        if (startBlock !== undefined && endBlock === undefined) {
            // Only startBlock provided - process from startBlock to latest
        const api = await createApi();
        endBlock = await getLatestBlockNumber(api);
        await disconnectApi(api);
            console.log(`Processing from block ${startBlock} to latest (${endBlock})`);
        } else if (endBlock !== undefined && startBlock === undefined) {
            // Only endBlock provided - process from 0 to endBlock
            startBlock = 0;
            console.log(`Processing from block 0 to ${endBlock}`);
        } else if (startBlock !== undefined && endBlock !== undefined) {
            // Both provided - process specified range
            console.log(`Processing from block ${startBlock} to ${endBlock}`);
        }
    } else {
        // No parameters - auto determine range from DB highest to chain latest
        let dbHighest = 0;
        try {
            const highestBlock = await (await initializeDataSource()).getRepository(AcalaBlock)
                .createQueryBuilder('block')
                .select('MAX(block.number)', 'maxNumber')
                .getRawOne();
            dbHighest = highestBlock?.maxNumber || 0;
            console.log(`Highest block in DB: ${dbHighest}`);
        } catch (e) {
            console.error('Error getting highest block from DB:', e);
            dbHighest = 0;
        }

        const api = await createApi();
        const chainLatest = await getLatestBlockNumber(api);
        await disconnectApi(api);
        
        startBlock = dbHighest > 0 ? dbHighest + 1 : 0;
        endBlock = chainLatest;
        isHistorical = true;
        
        console.log(`Auto-determined block range: ${startBlock} to ${endBlock}`);
    }

    return {
        startBlock: startBlock!,
        endBlock: endBlock!,
        isHistorical
    };
}

export async function getLatestBlock(): Promise<number> {
    const api = await createApi();
    const latest = await getLatestBlockNumber(api);
    await disconnectApi(api);
    return latest;
}
