import { ApiPromise } from '@polkadot/api';
import { 
    parseTimeRange,
    getLatestBlockNumber,
    getBlockTimestamp
} from '../../utils/blockTime';

export abstract class BaseBlockProcessor {
    protected abstract getBlockTime(): number;
    protected abstract getChainSpecificInfo(api: ApiPromise): Promise<Record<string, any>>;

    async processBlockRange(api: ApiPromise, timeRange: string) {
        const timeMs = parseTimeRange(timeRange);
        const now = Date.now();
        const targetTime = now - timeMs;
        
        const latestBlock = await getLatestBlockNumber(api);
        const latestTimestamp = await getBlockTimestamp(api, await api.rpc.chain.getBlockHash(latestBlock));
        
        let low = 0;
        let high = latestBlock;
        let startBlock = latestBlock;
        
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const hash = await api.rpc.chain.getBlockHash(mid);
            const timestamp = await getBlockTimestamp(api, hash);
            
            if (timestamp >= targetTime) {
                startBlock = mid;
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }
        
        try {
            const hash = await api.rpc.chain.getBlockHash(startBlock);
            const header = await api.rpc.chain.getHeader(hash);
            const timestamp = await api.query.timestamp.now.at(hash);
            
            return {
                timeRange: timeRange,
                firstBlock: {
                    number: startBlock,
                    hash: hash.toString(),
                    timestamp: new Date(Number(timestamp.toString())).toISOString(),
                    parentHash: header.parentHash.toString()
                },
                latestBlock: latestBlock,
                blockDiff: latestBlock - startBlock
            };
        } catch (err) {
            console.error(`Error processing first block ${startBlock}:`, err);
            throw err;
        }
    }

    async processBlock(api: ApiPromise) {
        const hash = await api.rpc.chain.getBlockHash();
        const header = await api.rpc.chain.getHeader(hash);
        const timestamp = await api.query.timestamp.now.at(hash);

        const [chain, nodeName, nodeVersion] = await Promise.all([
            api.rpc.system.chain(),
            api.rpc.system.name(),
            api.rpc.system.version()
        ]);

        const totalBlocks = await api.query.system.number();
        const finalizedHead = await api.rpc.chain.getFinalizedHead();
        const finalizedHeader = await api.rpc.chain.getHeader(finalizedHead);

        const chainSpecificInfo = await this.getChainSpecificInfo(api);

        return {
            currentBlock: {
                number: header.number.toNumber(),
                hash: hash.toString(),
                timestamp: new Date(Number(timestamp.toString())).toISOString(),
                parentHash: header.parentHash.toString()
            },
            chainInfo: {
                chain: chain.toString(),
                nodeName: nodeName.toString(),
                nodeVersion: nodeVersion.toString(),
                ...chainSpecificInfo
            },
            chainStats: {
                totalBlocks: Number(totalBlocks.toString()),
                finalizedBlock: finalizedHeader.number.toNumber(),
                blockTime: this.getBlockTime()
            }
        };
    }
}
