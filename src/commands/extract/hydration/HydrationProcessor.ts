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
        // Start transaction
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        
        try {
            const records = data.map(item => {
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
                return record;
            });
            
            // Batch insert
            await queryRunner.manager.save(HydrationData, records);
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

    private async fetchPoolApr(assetId: string): Promise<number> {
        try {
            const data = await this.fetchWithRetry(
                `https://api.hydradx.io/hydradx-ui/v2/stats/fees/${assetId}`
            );
            return parseFloat(data?.[0]?.projected_apr_perc) || 0;
        } catch (error) {
            this.logger.error(`Failed to fetch pool APR for ${assetId}: ${error}`);
            return 0;
        }
    }

    private async fetchTvl(assetId: string): Promise<number> {
        try {
            const data = await this.fetchWithRetry(
                `https://api.hydradx.io/hydradx-ui/v2/stats/tvl/${assetId}`
            );
            return parseFloat(data?.[0]?.tvl_usd) || 0;
        } catch (error) {
            this.logger.error(`Failed to fetch TVL for ${assetId}: ${error}`);
            return 0;
        }
    }

    private async fetchVolume(assetId: string): Promise<number> {
        try {
            const data = await this.fetchWithRetry(
                `https://api.hydradx.io/hydradx-ui/v1/stats/charts/volume/${assetId}`
            );
            return parseFloat(data?.[data.length - 1]?.volume_usd) || 0;
        } catch (error) {
            this.logger.error(`Failed to fetch volume for ${assetId}: ${error}`);
            return 0;
        }
    }
}

export async function processHydrationData(batchLog: BatchLog) {
    const processor = new HydrationProcessor();
    return processor.process(batchLog);
}
