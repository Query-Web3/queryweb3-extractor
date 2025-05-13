import { ApiPromise } from '@polkadot/api';
import { AcalaBlock } from '../../../entities/acala/AcalaBlock';
import { BaseProcessor } from '../BaseProcessor';
import { createApiConnection } from '../../common/apiConnector';
import { processChunk } from '../parallelManager';
import { BatchLog } from '../../../entities/BatchLog';
import { determineBlockRange } from '../blockRange';

export class AcalaProcessor extends BaseProcessor<{startBlock: number, endBlock: number}> {
    private api?: ApiPromise;

    protected getProcessorName(): string {
        return 'Acala';
    }

    protected async fetchData(): Promise<{startBlock: number, endBlock: number}> {
        const range = await determineBlockRange();
        return { 
            startBlock: range.startBlock, 
            endBlock: range.endBlock 
        };
    }

    protected async processData(range: {startBlock: number, endBlock: number}): Promise<any[]> {
        this.api = await createApiConnection();
        if (!this.api) {
            throw new Error('Failed to create API connection');
        }
        
        const blocks = [];
        
        for (let blockNumber = range.startBlock; blockNumber <= range.endBlock; blockNumber++) {
            const blockHash = await this.api.rpc.chain.getBlockHash(blockNumber);
            const header = await this.api.rpc.chain.getHeader(blockHash);
            
            const apiAt = await this.api.at(blockHash);
            let dexPools: [any, any][] = [];
            let stableCoinBalances: [any, any][] = [];
            
            try {
                if (apiAt.query.dex?.liquidityPool) {
                    dexPools = await apiAt.query.dex.liquidityPool.entries();
                }
            } catch (e) {
                this.logger.warn(`Failed to get DEX pools for block ${blockNumber}`);
            }
            
            try {
                if (apiAt.query.honzon?.totalPositions) {
                    stableCoinBalances = await apiAt.query.honzon.totalPositions.entries();
                }
            } catch (e) {
                this.logger.warn(`Failed to get stable coin balances for block ${blockNumber}`);
            }
            
            blocks.push({
                number: blockNumber,
                hash: blockHash.toString(),
                header,
                hashObj: blockHash,
                acalaData: {
                    dexPools: dexPools.map(([key, value]) => ({
                        poolId: key.args[0].toString(),
                        liquidity: value.toString()
                    })),
                    stableCoinBalances: stableCoinBalances.map(([key, value]) => ({
                        accountId: key.args[0].toString(),
                        position: value.toString()
                    }))
                }
            });
        }
        
        return blocks;
    }

    protected async saveData(blocks: any[]): Promise<void> {
        if (!this.api || blocks.length === 0) return;
        
        const chunks = this.splitIntoChunks(blocks);
        for (const chunk of chunks) {
            await processChunk(chunk, this.api, this.batchId);
        }
    }

    protected async getLastProcessedHeight(): Promise<number | null> {
        const lastBlock = await this.dataSource.getRepository(AcalaBlock)
            .createQueryBuilder()
            .select('MAX(number)', 'max')
            .getRawOne();
        return lastBlock?.max || null;
    }

    protected async cleanup(): Promise<void> {
        if (this.api) {
            await this.api.disconnect();
        }
    }

    private splitIntoChunks(blocks: any[], size = 100): any[][] {
        const chunks = [];
        for (let i = 0; i < blocks.length; i += size) {
            chunks.push(blocks.slice(i, i + size));
        }
        return chunks;
    }
}

export async function processBlocks(
    batchLog: BatchLog, 
    startBlock?: number, 
    endBlock?: number
) {
    const processor = new AcalaProcessor();
    return processor.process(batchLog);
}
