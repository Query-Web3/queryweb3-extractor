import { DataSource } from 'typeorm';
import { BatchLog, BatchStatus } from '../../../entities/BatchLog';
import { StellaswapPoolData } from '../../../entities/stellaswap/StellaswapPoolData';
import { initializeDataSource } from '../dataSource';
import { checkAndAcquireLock, releaseLock } from '../lockManager';
import { Logger, LogLevel } from '../../../utils/logger';
import axios from 'axios';
import * as math from 'mathjs';

export interface StellaswapProcessResult {
    processedCount: number;
    lastProcessedHeight: number | null;
}

export async function processStellaswapData(
    batchLog: BatchLog
): Promise<StellaswapProcessResult> {
    const logger = Logger.getInstance();
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    logger.setBatchLog(batchLog);
    
    const batchId = batchLog.batchId;
    const numericBatchId = parseInt(batchId) || Date.now();
    logger.info(`Starting StellaSwap batch with ID: ${batchId}`);

    const dataSource = await initializeDataSource();
    
    const hasLock = await checkAndAcquireLock(dataSource, batchId);
    if (!hasLock) {
        return {
            processedCount: 0,
            lastProcessedHeight: null
        };
    }

    try {
        // Fetch pools APR data
        const poolsAprData = await fetchPoolsAprData();
        // Fetch farming APR data
        const farmingAprData = await fetchFarmingAprData();
        // Fetch and process pool data
        const processedData = await processPoolData(poolsAprData, farmingAprData);

        // Save to database
        await saveStellaswapData(dataSource, numericBatchId, processedData);

        await updateBatchLog(
            dataSource, 
            batchLog, 
            processedData.length,
            Date.now()
        );

        await releaseLock(dataSource, batchId);

        return {
            processedCount: processedData.length,
            lastProcessedHeight: Date.now()
        };
    } catch (e) {
        if (e instanceof Error) {
            logger.error('Error processing StellaSwap data', e);
        } else {
            logger.error('Error processing StellaSwap data', new Error(String(e)));
        }
        await releaseLock(dataSource, batchId, false);
        throw e;
    }
}

async function fetchPoolsAprData(): Promise<Record<string, number>> {
    const url = "https://apr-api.stellaswap.com/api/v1/integral/poolsApr";
    try {
        const response = await axios.get(url);
        if (response.status === 200 && response.data?.isSuccess) {
            return response.data.result;
        }
        throw new Error(`Failed to fetch pools APR: ${response.status}`);
    } catch (error) {
        throw new Error(`Error fetching pools APR data: ${error}`);
    }
}

async function fetchFarmingAprData(): Promise<Record<string, any>> {
    const url = "https://apr-api.stellaswap.com/api/v1/integral/offchain/farmingAPR";
    try {
        const response = await axios.get(url);
        if (response.status === 200 && response.data?.code === 200) {
            return response.data.result.pools;
        }
        throw new Error(`Failed to fetch farming APR: ${response.status}`);
    } catch (error) {
        throw new Error(`Error fetching farming APR data: ${error}`);
    }
}

async function fetchPoolData(): Promise<any> {
    const graphUrl = process.env.STELLASWAP_GRAPH_URL || "";
    const query = `{
        pools(first: 55) {
            id
            token0 { id symbol name decimals }
            token1 { id symbol name decimals }
            liquidity
            sqrtPrice
            tick
            volumeUSD
            txCount
            feesUSD
        }
    }`;

    try {
        const response = await axios.post(graphUrl, { query });
        if (response.status === 200) {
            return response.data;
        }
        throw new Error(`Failed to fetch pool data: ${response.status}`);
    } catch (error) {
        throw new Error(`Error fetching pool data: ${error}`);
    }
}

async function processPoolData(
    poolsAprData: Record<string, number>,
    farmingAprData: Record<string, any>
): Promise<any[]> {
    const rawData = await fetchPoolData();
    if (!rawData?.data?.pools) {
        throw new Error("No valid pool data received");
    }

    const processedData = [];
    for (const pool of rawData.data.pools) {
        const poolId = pool.id;
        const poolsApr = poolsAprData[poolId] || 0;
        const farmingInfo = farmingAprData[poolId] || {};
        const farmingApr = farmingInfo.apr || 0;
        const tokenRewards = JSON.stringify(farmingInfo.tokenRewards || {});

        processedData.push({
            pool_id: poolId,
            token0_id: pool.token0.id,
            token0_symbol: pool.token0.symbol,
            token0_name: pool.token0.name,
            token0_decimals: pool.token0.decimals,
            token1_id: pool.token1.id,
            token1_symbol: pool.token1.symbol,
            token1_name: pool.token1.name,
            token1_decimals: pool.token1.decimals,
            liquidity: parseFloat(pool.liquidity),
            sqrt_price: parseFloat(pool.sqrtPrice),
            tick: parseInt(pool.tick),
            volume_usd_current: parseFloat(pool.volumeUSD),
            tx_count: parseInt(pool.txCount),
            fees_usd_current: parseFloat(pool.feesUSD),
            pools_apr: poolsApr,
            farming_apr: farmingApr,
            final_apr: poolsApr + farmingApr,
            token_rewards: tokenRewards,
            amount_token0: 0, // Will be calculated
            amount_token1: 0  // Will be calculated
        });
    }

    return processedData;
}

async function saveStellaswapData(
    dataSource: DataSource,
    batchId: number,
    data: any[]
) {
    for (const item of data) {
        const record = new StellaswapPoolData();
        Object.assign(record, {
            batch_id: batchId,
            ...item,
            created_at: new Date()
        });
        await dataSource.getRepository(StellaswapPoolData).save(record);
    }
}

async function updateBatchLog(
    dataSource: DataSource,
    batchLog: {id: number, batchId: string},
    processedCount: number,
    lastProcessedHeight: number | null
) {
    if (batchLog) {
        await dataSource.getRepository(BatchLog).update(batchLog.id, {
            endTime: new Date(),
            status: BatchStatus.SUCCESS,
            processed_block_count: processedCount,
            last_processed_height: lastProcessedHeight
        });
    }
}
