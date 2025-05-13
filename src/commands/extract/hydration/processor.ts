import { DataSource } from 'typeorm';
import { BatchLog, BatchStatus } from '../../../entities/BatchLog';
import { HydrationData } from '../../../entities/hydration/HydrationData';
import { initializeDataSource } from '../dataSource';
import { checkAndAcquireLock, releaseLock } from '../lockManager';
import { Logger, LogLevel } from '../../../utils/logger';
import axios from 'axios';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface HydrationProcessResult {
    processedCount: number;
    lastProcessedHeight: number | null;
}

export async function processHydrationData(
    batchLog: BatchLog
): Promise<HydrationProcessResult> {
    const logger = Logger.getInstance();
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    logger.setBatchLog(batchLog);
    
    const batchId = batchLog.batchId;
    const numericBatchId = parseInt(batchId) || Date.now();
    logger.info(`Starting Hydration batch with ID: ${batchId}`);

    const dataSource = await initializeDataSource();
    
    const hasLock = await checkAndAcquireLock(dataSource, batchId);
    if (!hasLock) {
        return {
            processedCount: 0,
            lastProcessedHeight: null
        };
    }

    try {
        // Fetch farm APR data
        const farmAprData = await fetchFarmAprData();
        // Process and fetch additional metrics
        const processedData = await processHydrationMetrics(farmAprData);

        // Save to database
        await saveHydrationData(dataSource, numericBatchId, processedData);

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
            logger.error('Error processing Hydration data', e);
        } else {
            logger.error('Error processing Hydration data', new Error(String(e)));
        }
        await releaseLock(dataSource, batchId, false);
        throw e;
    }
}

async function fetchFarmAprData(): Promise<Record<string, number>> {
    const scriptPath = path.join(process.cwd(), 'sdk/packages/sdk/test/script/examples/getTop35Apr.ts');
    const outputFile = path.join(process.cwd(), 'farm_apr.json');
    
    try {
        execSync(`npx tsx ${scriptPath} ${outputFile}`, { stdio: 'inherit' });
        const data = fs.readFileSync(outputFile, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        throw new Error(`Error fetching farm APR data: ${error}`);
    }
}

async function fetchPoolApr(assetId: string): Promise<number> {
    try {
        const response = await axios.get(`https://api.hydradx.io/hydradx-ui/v2/stats/fees/${assetId}`);
        if (response.status === 200 && response.data?.length > 0) {
            return parseFloat(response.data[0].projected_apr_perc) || 0;
        }
        return 0;
    } catch (error) {
        throw new Error(`Error fetching pool APR for asset ${assetId}: ${error}`);
    }
}

async function fetchTvl(assetId: string): Promise<number> {
    try {
        const response = await axios.get(`https://api.hydradx.io/hydradx-ui/v2/stats/tvl/${assetId}`);
        if (response.status === 200 && response.data?.length > 0) {
            return parseFloat(response.data[0].tvl_usd) || 0;
        }
        return 0;
    } catch (error) {
        throw new Error(`Error fetching TVL for asset ${assetId}: ${error}`);
    }
}

async function fetchVolume(assetId: string): Promise<number> {
    try {
        const response = await axios.get(`https://api.hydradx.io/hydradx-ui/v1/stats/charts/volume/${assetId}`);
        if (response.status === 200 && response.data?.length > 0) {
            return parseFloat(response.data[response.data.length - 1].volume_usd) || 0;
        }
        return 0;
    } catch (error) {
        throw new Error(`Error fetching volume for asset ${assetId}: ${error}`);
    }
}

async function processHydrationMetrics(farmAprData: Record<string, number>): Promise<any[]> {
    const processedData = [];
    
    for (const [assetId, farmApr] of Object.entries(farmAprData)) {
        const poolApr = await fetchPoolApr(assetId);
        const tvl = await fetchTvl(assetId);
        const volume = await fetchVolume(assetId);
        
        processedData.push({
            asset_id: assetId,
            farm_apr: farmApr,
            pool_apr: poolApr,
            total_apr: farmApr + poolApr,
            tvl_usd: tvl,
            volume_usd: volume
        });
    }
    
    return processedData;
}

async function saveHydrationData(
    dataSource: DataSource,
    batchId: number,
    data: any[]
) {
    for (const item of data) {
        const record = new HydrationData();
        record.batch_id = batchId;
        record.asset_id = item.asset_id;
        record.symbol = item.symbol || 'N/A';
        record.farm_apr = item.farm_apr;
        record.pool_apr = item.pool_apr;
        record.total_apr = item.total_apr;
        record.tvl_usd = item.tvl_usd;
        record.volume_usd = item.volume_usd;
        record.created_at = new Date();
        
        await dataSource.getRepository(HydrationData).save(record);
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
