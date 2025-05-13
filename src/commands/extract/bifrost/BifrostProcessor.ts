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
        await this.dataSource.getRepository(BifrostBatchIDTable).save(batchRecord);

        for (const item of data) {
            if (item.asset) { // Site data
                const record = new BifrostSiteTable();
                Object.assign(record, item);
                record.batch_id = this.numericBatchId;
                record.created_at = new Date();
                await this.dataSource.getRepository(BifrostSiteTable).save(record);
            } else if (item.assetId) { // Staking data
                const record = new BifrostStakingTable();
                Object.assign(record, item);
                record.batch_id = this.numericBatchId;
                record.created_at = new Date();
                await this.dataSource.getRepository(BifrostStakingTable).save(record);
            } else { // Price data
                const record = new BifrostPriceTable();
                record.batch_id = this.numericBatchId;
                record.asset_id = item.assetId || '';
                record.symbol = item.symbol || '';
                record.price_usdt = item.price || 0;
                record.created_at = new Date();
                await this.dataSource.getRepository(BifrostPriceTable).save(record);
            }
        }
    }

    protected async getLastProcessedHeight(): Promise<number | null> {
        return Date.now();
    }

    private async fetchSiteData(): Promise<any[]> {
        const response = await axios.get('https://dapi.bifrost.io/api/site');
        if (response.status === 200) {
            const data = response.data;
            return Object.entries(data).map(([key, value]) => ({
                asset: key,
                ...(typeof value === 'object' ? value : { value })
            }));
        }
        throw new Error(`Failed to fetch site data: ${response.status}`);
    }

    private async fetchStakingData(): Promise<any[]> {
        const response = await axios.get('https://dapi.bifrost.io/api/staking');
        if (response.status === 200) {
            return response.data?.supportedAssets || [];
        }
        throw new Error(`Failed to fetch staking data: ${response.status}`);
    }

    private async fetchPriceData(): Promise<any[]> {
        const response = await axios.get('https://api.bifrost.io/prices');
        if (response.status === 200) {
            return response.data?.prices || [];
        }
        throw new Error(`Failed to fetch price data: ${response.status}`);
    }
}

export async function processBifrostData(batchLog: BatchLog) {
    const processor = new BifrostProcessor();
    return processor.process(batchLog);
}
