import { DataSource } from 'typeorm';
import { Block } from '../../entities/Block';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { options } from '@acala-network/api';
import { initializeDataSource } from './dataSource';

export interface BlockRange {
    startBlock: number;
    endBlock: number;
    isHistorical: boolean;
}

function parseTimeRange(timeRange: string): number {
    const match = timeRange.match(/^(\d+)([dwmMy])$/);
    if (!match) {
        throw new Error(`Invalid time range format: ${timeRange}. Expected format like 2d, 3w, 1m, 1y`);
    }

    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
        case 'd': return value * 24 * 60 * 60 * 1000; // days to ms
        case 'w': return value * 7 * 24 * 60 * 60 * 1000; // weeks to ms
        case 'm': return value * 30 * 24 * 60 * 60 * 1000; // months to ms
        case 'y': return value * 365 * 24 * 60 * 60 * 1000; // years to ms
        default: throw new Error(`Unknown time unit: ${unit}`);
    }
}

export async function determineBlockRange(
    startBlock?: number, 
    endBlock?: number,
    timeRange?: string
): Promise<BlockRange> {
    let isHistorical = false;
    
    if (timeRange !== undefined) {
        const timeMs = parseTimeRange(timeRange);
        const now = Date.now();
        const targetTime = now - timeMs;
        
        const provider = new WsProvider('wss://acala-rpc.aca-api.network');
        const api = await ApiPromise.create(options({ provider }));
        
        // Get current block number and timestamp
        const header = await api.rpc.chain.getHeader();
        const latestBlock = header.number.toNumber();
        const latestTimestamp = parseInt((await api.query.timestamp.now()).toString());
        
        // Estimate block time (ms per block)
        const blockTime = 12000; // Acala has ~12s block time
        
        // Calculate approximate block number at target time
        const timeDiff = latestTimestamp - targetTime;
        const blocksDiff = Math.floor(timeDiff / blockTime);
        startBlock = Math.max(0, latestBlock - blocksDiff);
        endBlock = latestBlock;
        
        await api.disconnect();
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
            const provider = new WsProvider('wss://acala-rpc.aca-api.network');
            const api = await ApiPromise.create(options({ provider }));
            const header = await api.rpc.chain.getHeader();
            endBlock = header.number.toNumber();
            await api.disconnect();
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
            const highestBlock = await (await initializeDataSource()).getRepository(Block)
                .createQueryBuilder('block')
                .select('MAX(block.number)', 'maxNumber')
                .getRawOne();
            dbHighest = highestBlock?.maxNumber || 0;
            console.log(`Highest block in DB: ${dbHighest}`);
        } catch (e) {
            console.error('Error getting highest block from DB:', e);
            dbHighest = 0;
        }

        const provider = new WsProvider('wss://acala-rpc.aca-api.network');
        const api = await ApiPromise.create(options({ provider }));
        const header = await api.rpc.chain.getHeader();
        const chainLatest = header.number.toNumber();
        await api.disconnect();
        
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
    const provider = new WsProvider('wss://acala-rpc.aca-api.network');
    const api = await ApiPromise.create(options({ provider }));
    const header = await api.rpc.chain.getHeader();
    const latest = header.number.toNumber();
    await api.disconnect();
    return latest;
}
