import { BatchLog } from '../../../entities/BatchLog';
import { BaseProcessor } from '../BaseProcessor';
import { BifrostBatchIDTable } from '../../../entities/bifrost/BifrostBatchIDTable';
import { BifrostSiteTable } from '../../../entities/bifrost/BifrostSiteTable';
import { BifrostStakingTable } from '../../../entities/bifrost/BifrostStakingTable';
import { BifrostPriceTable } from '../../../entities/bifrost/BifrostPriceTable';
import axios from 'axios';

export class BifrostProcessor extends BaseProcessor<{
    siteData: any[];
    stakingData: any[];
    priceData: any[];
}> {
    protected getProcessorName(): string {
        return 'Bifrost';
    }

    protected async fetchData(): Promise<{
        siteData: any[];
        stakingData: any[];
        priceData: any[];
    }> {
        const [siteData, stakingData, priceData] = await Promise.all([
            this.fetchSiteData(),
            this.fetchStakingData(),
            this.fetchPriceData()
        ]);
        return { siteData, stakingData, priceData };
    }

    protected async processData(data: {
        siteData: any[];
        stakingData: any[];
        priceData: any[];
    }): Promise<any[]> {
        return [...data.siteData, ...data.stakingData, ...data.priceData];
    }

    protected async saveData(data: any[]): Promise<void> {
        const batchRecord = new BifrostBatchIDTable();
        batchRecord.batch_id = this.numericBatchId;
        batchRecord.chain = 'bifrost';
        batchRecord.status = 'success';
        batchRecord.created_at = new Date();
        
        // Start transaction
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        
        try {
            // Save batch record
            await queryRunner.manager.save(BifrostBatchIDTable, batchRecord);
            
            // Batch save by data type
            const siteRecords = [];
            const stakingRecords = [];
            const priceRecords = [];
            
            for (const item of data) {
                if (item.asset) { // Site data
                    const record = new BifrostSiteTable();
                    Object.assign(record, item);
                    record.batch_id = this.numericBatchId;
                    record.created_at = new Date();
                    siteRecords.push(record);
                } else if (item.assetId) { // Staking data
                    const record = new BifrostStakingTable();
                    Object.assign(record, item);
                    record.batch_id = this.numericBatchId;
                    record.created_at = new Date();
                    stakingRecords.push(record);
                } else { // Price data
                    const record = new BifrostPriceTable();
                    record.batch_id = this.numericBatchId;
                    record.asset_id = item.assetId || '';
                    record.symbol = item.symbol || '';
                    record.price_usdt = item.price || 0;
                    record.created_at = new Date();
                    priceRecords.push(record);
                }
            }
            
            // Batch insert
            if (siteRecords.length > 0) {
                await queryRunner.manager.save(BifrostSiteTable, siteRecords);
            }
            if (stakingRecords.length > 0) {
                await queryRunner.manager.save(BifrostStakingTable, stakingRecords);
            }
            if (priceRecords.length > 0) {
                await queryRunner.manager.save(BifrostPriceTable, priceRecords);
            }
            
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    protected async getLastProcessedHeight(): Promise<number | null> {
        return Date.now();
    }

    private async fetchWithRetry(url: string, maxRetries = 3): Promise<any> {
        let retries = 0;
        while (retries < maxRetries) {
            try {
                const response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'Accept': 'application/json',
                        'Cache-Control': 'no-cache'
                    }
                });
                if (response.status === 200) {
                    return response.data;
                }
            } catch (error) {
                this.logger.warn(`Attempt ${retries + 1} failed for ${url}: ${error}`);
            }
            retries++;
            if (retries < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            }
        }
        throw new Error(`Failed to fetch data from ${url} after ${maxRetries} attempts`);
    }

    private async fetchSiteData(): Promise<any[]> {
        const data = await this.fetchWithRetry('https://dapi.bifrost.io/api/site');
        return Object.entries(data).map(([key, value]) => ({
            asset: key,
            ...(typeof value === 'object' ? value : { value }),
            timestamp: new Date().toISOString()
        }));
    }

    private async fetchStakingData(): Promise<any[]> {
        const data = await this.fetchWithRetry('https://dapi.bifrost.io/api/staking');
        return (data?.supportedAssets || []).map((asset: any) => ({
            ...asset,
            timestamp: new Date().toISOString()
        }));
    }

    private async fetchPriceData(): Promise<any[]> {
        const data = await this.fetchWithRetry('https://api.bifrost.io/prices');
        return (data?.prices || []).map((price: any) => ({
            ...price,
            timestamp: new Date().toISOString()
        }));
    }
}

export async function processBifrostData(batchLog: BatchLog) {
    const processor = new BifrostProcessor();
    return processor.process(batchLog);
}
