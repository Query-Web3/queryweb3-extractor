import { ApiPromise } from '@polkadot/api';
import { AcalaBlock } from '../../../entities/acala/AcalaBlock';
import { BaseProcessor } from '../BaseProcessor';
import { createApiConnection } from '../../common/apiConnector';
import { processChunk } from '../parallelManager';
import { BatchLog } from '../../../entities/BatchLog';
import { determineBlockRange } from '../blockRange';

export class AcalaProcessor extends BaseProcessor<{startBlock: number, endBlock: number}> {
    private api?: ApiPromise;
    private currentBatchId?: string;

    public setApi(api: ApiPromise): void {
        this.api = api;
    }

    public setBatchId(batchId: string): void {
        this.currentBatchId = batchId;
    }

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
            // 添加重试机制获取区块数据
            const getBlockDataWithRetry = async (retries = 3): Promise<{hash: string, header: any, apiAt: any}> => {
                if (!this.api) {
                    throw new Error('API connection not established');
                }
                try {
                    const blockHash = await this.api.rpc.chain.getBlockHash(blockNumber);
                    const header = await this.api.rpc.chain.getHeader(blockHash);
                    const apiAt = await this.api.at(blockHash);
                    return { hash: blockHash.toString(), header, apiAt };
                } catch (e) {
                    if (retries > 0) {
                        this.logger.warn(`Retrying block ${blockNumber} (${retries} retries left)`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        return getBlockDataWithRetry(retries - 1);
                    }
                    throw e;
                }
            };

            const { hash, header, apiAt } = await getBlockDataWithRetry();
            let dexPools: [any, any][] = [];
            let stableCoinBalances: [any, any][] = [];
            
            // 添加重试机制获取DEX池数据
            const getDexPoolsWithRetry = async (retries = 3): Promise<[any, any][]> => {
                try {
                    if (apiAt.query.dex?.liquidityPool) {
                        return await apiAt.query.dex.liquidityPool.entries();
                    }
                    return [];
                } catch (e) {
                    if (retries > 0) {
                        this.logger.warn(`Retrying DEX pools for block ${blockNumber} (${retries} retries left)`);
                        await new Promise(resolve => setTimeout(resolve, 500));
                        return getDexPoolsWithRetry(retries - 1);
                    }
                    this.logger.warn(`Failed to get DEX pools for block ${blockNumber}`);
                    return [];
                }
            };

            // 添加重试机制获取稳定币余额数据
            const getStableCoinBalancesWithRetry = async (retries = 3): Promise<[any, any][]> => {
                try {
                    if (apiAt.query.honzon?.totalPositions) {
                        return await apiAt.query.honzon.totalPositions.entries();
                    }
                    return [];
                } catch (e) {
                    if (retries > 0) {
                        this.logger.warn(`Retrying stable coin balances for block ${blockNumber} (${retries} retries left)`);
                        await new Promise(resolve => setTimeout(resolve, 500));
                        return getStableCoinBalancesWithRetry(retries - 1);
                    }
                    this.logger.warn(`Failed to get stable coin balances for block ${blockNumber}`);
                    return [];
                }
            };

            dexPools = await getDexPoolsWithRetry();
            stableCoinBalances = await getStableCoinBalancesWithRetry();
            
            blocks.push({
                number: blockNumber,
                hash: hash,
                header,
                hashObj: hash,
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

    public async saveData(blocks: any[]): Promise<void> {
        if (!this.api || !this.currentBatchId || blocks.length === 0) return;
        
        const chunks = this.splitIntoChunks(blocks);
        let processedChunks = 0;
        const totalChunks = chunks.length;
        
        for (const chunk of chunks) {
            processedChunks++;
            this.logger.info(`Processing chunk ${processedChunks}/${totalChunks} (${chunk.length} blocks)`);
            
            try {
                await processChunk(chunk, this.api, this.currentBatchId);
                this.logger.recordSuccess();
            } catch (e) {
                this.logger.error(`Failed to process chunk ${processedChunks}`, e as Error);
                this.logger.recordError();
            }
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
