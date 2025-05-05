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

export async function determineBlockRange(
    startBlock?: number, 
    endBlock?: number
): Promise<BlockRange> {
    let isHistorical = false;
    
    if (startBlock !== undefined || endBlock !== undefined) {
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
