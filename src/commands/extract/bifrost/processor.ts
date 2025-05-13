import { DataSource } from 'typeorm';
import { BatchLog, BatchStatus } from '../../../entities/BatchLog';
import { BifrostBatchIDTable } from '../../../entities/bifrost/BifrostBatchIDTable';
import { BifrostSiteTable } from '../../../entities/bifrost/BifrostSiteTable';
import { BifrostStakingTable } from '../../../entities/bifrost/BifrostStakingTable';
import { BifrostPriceTable } from '../../../entities/bifrost/BifrostPriceTable';
import { initializeDataSource } from '../dataSource';
import { checkAndAcquireLock, releaseLock } from '../lockManager';
import { Logger, LogLevel } from '../../../utils/logger';
import axios from 'axios';

export interface BifrostProcessResult {
    processedCount: number;
    lastProcessedHeight: number | null;
}

export async function processBifrostData(
    batchLog: BatchLog
): Promise<BifrostProcessResult> {
    const logger = Logger.getInstance();
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    logger.setBatchLog(batchLog);
    
    const batchId = batchLog.batchId;
    const numericBatchId = parseInt(batchId) || Date.now();
    logger.info(`Starting Bifrost batch with ID: ${batchId}`);

    const dataSource = await initializeDataSource();
    
    const hasLock = await checkAndAcquireLock(dataSource, batchId);
    if (!hasLock) {
        return {
            processedCount: 0,
            lastProcessedHeight: null
        };
    }

    try {
        // Fetch site data
        const siteData = await fetchBifrostSiteData();
        // Fetch staking data
        const stakingData = await fetchBifrostStakingData();
        // Fetch price data
        const priceData = await fetchBifrostPriceData();

        // Save to database
        await saveBifrostData(dataSource, numericBatchId, siteData, stakingData, priceData);

        await updateBatchLog(
            dataSource, 
            batchLog, 
            siteData.length + stakingData.length + priceData.length,
            Date.now()
        );

        await releaseLock(dataSource, batchId);

        return {
            processedCount: siteData.length + stakingData.length + priceData.length,
            lastProcessedHeight: Date.now()
        };
    } catch (e) {
        if (e instanceof Error) {
            logger.error('Error processing Bifrost data', e);
        } else {
            logger.error('Error processing Bifrost data', new Error(String(e)));
        }
        await releaseLock(dataSource, batchId, false);
        throw e;
    }
}

async function fetchBifrostSiteData(): Promise<any[]> {
    try {
        const response = await axios.get('https://dapi.bifrost.io/api/site');
        if (response.status === 200) {
            const data = response.data;
            const extracted = [];
            for (const [key, value] of Object.entries(data)) {
                if (typeof value === 'object') {
                    extracted.push({ asset: key, ...value });
                } else {
                    extracted.push({ asset: key, value });
                }
            }
            return extracted;
        }
        throw new Error(`Failed to fetch site data: ${response.status}`);
    } catch (error) {
        throw new Error(`Error fetching Bifrost site data: ${error}`);
    }
}

async function fetchBifrostStakingData(): Promise<any[]> {
    try {
        const response = await axios.get('https://dapi.bifrost.io/api/staking');
        if (response.status === 200) {
            return response.data?.supportedAssets || [];
        }
        throw new Error(`Failed to fetch staking data: ${response.status}`);
    } catch (error) {
        throw new Error(`Error fetching Bifrost staking data: ${error}`);
    }
}

async function fetchBifrostPriceData(): Promise<any[]> {
    try {
        // This would be replaced with actual Bifrost price API endpoint
        const response = await axios.get('https://api.bifrost.io/prices');
        if (response.status === 200) {
            return response.data?.prices || [];
        }
        throw new Error(`Failed to fetch price data: ${response.status}`);
    } catch (error) {
        throw new Error(`Error fetching Bifrost price data: ${error}`);
    }
}

async function saveBifrostData(
    dataSource: DataSource,
    batchId: number,
    siteData: any[],
    stakingData: any[],
    priceData: any[]
) {
    const batchRecord = new BifrostBatchIDTable();
    batchRecord.batch_id = batchId;
    batchRecord.chain = 'bifrost';
    batchRecord.status = 'success';
    batchRecord.created_at = new Date();
    await dataSource.getRepository(BifrostBatchIDTable).save(batchRecord);

    for (const item of siteData) {
        const siteRecord = new BifrostSiteTable();
        Object.assign(siteRecord, item);
        siteRecord.batch_id = batchId;
        siteRecord.created_at = new Date();
        await dataSource.getRepository(BifrostSiteTable).save(siteRecord);
    }

    for (const item of stakingData) {
        const stakingRecord = new BifrostStakingTable();
        Object.assign(stakingRecord, item);
        stakingRecord.batch_id = batchId;
        stakingRecord.created_at = new Date();
        await dataSource.getRepository(BifrostStakingTable).save(stakingRecord);
    }

    // Save price data
    for (const item of priceData) {
        const priceRecord = new BifrostPriceTable();
        priceRecord.batch_id = batchId;
        priceRecord.asset_id = item.assetId || '';
        priceRecord.symbol = item.symbol || '';
        priceRecord.price_usdt = item.price || 0;
        priceRecord.created_at = new Date();
        await dataSource.getRepository(BifrostPriceTable).save(priceRecord);
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
