import { BatchLog } from '../../../entities/BatchLog';
import { BaseProcessor } from '../BaseProcessor';
import { HydrationData } from '../../../entities/hydration/HydrationData';
import axios from 'axios';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export class HydrationProcessor extends BaseProcessor<Record<string, number>> {
    protected getProcessorName(): string {
        return 'Hydration';
    }

    protected async fetchData(): Promise<Record<string, number>> {
        const scriptPath = path.join(process.cwd(), 'sdk/packages/sdk/test/script/examples/getTop35Apr.ts');
        const outputFile = path.join(process.cwd(), 'farm_apr.json');
        
        execSync(`npx tsx ${scriptPath} ${outputFile}`, { stdio: 'inherit' });
        const data = fs.readFileSync(outputFile, 'utf-8');
        return JSON.parse(data);
    }

    protected async processData(farmAprData: Record<string, number>): Promise<any[]> {
        const processedData = [];
        
        for (const [assetId, farmApr] of Object.entries(farmAprData)) {
            const [poolApr, tvl, volume] = await Promise.all([
                this.fetchPoolApr(assetId),
                this.fetchTvl(assetId),
                this.fetchVolume(assetId)
            ]);
            
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

    protected async saveData(data: any[]): Promise<void> {
        for (const item of data) {
            const record = new HydrationData();
            record.batch_id = this.numericBatchId;
            record.asset_id = item.asset_id;
            record.symbol = item.symbol || 'N/A';
            record.farm_apr = item.farm_apr;
            record.pool_apr = item.pool_apr;
            record.total_apr = item.total_apr;
            record.tvl_usd = item.tvl_usd;
            record.volume_usd = item.volume_usd;
            record.created_at = new Date();
            
            await this.dataSource.getRepository(HydrationData).save(record);
        }
    }

    protected async getLastProcessedHeight(): Promise<number | null> {
        return Date.now();
    }

    private async fetchPoolApr(assetId: string): Promise<number> {
        const response = await axios.get(`https://api.hydradx.io/hydradx-ui/v2/stats/fees/${assetId}`);
        if (response.status === 200 && response.data?.length > 0) {
            return parseFloat(response.data[0].projected_apr_perc) || 0;
        }
        return 0;
    }

    private async fetchTvl(assetId: string): Promise<number> {
        const response = await axios.get(`https://api.hydradx.io/hydradx-ui/v2/stats/tvl/${assetId}`);
        if (response.status === 200 && response.data?.length > 0) {
            return parseFloat(response.data[0].tvl_usd) || 0;
        }
        return 0;
    }

    private async fetchVolume(assetId: string): Promise<number> {
        const response = await axios.get(`https://api.hydradx.io/hydradx-ui/v1/stats/charts/volume/${assetId}`);
        if (response.status === 200 && response.data?.length > 0) {
            return parseFloat(response.data[response.data.length - 1].volume_usd) || 0;
        }
        return 0;
    }
}

export async function processHydrationData(batchLog: BatchLog) {
    const processor = new HydrationProcessor();
    return processor.process(batchLog);
}
