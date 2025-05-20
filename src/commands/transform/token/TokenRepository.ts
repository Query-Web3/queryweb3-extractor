import { DataSource } from 'typeorm';
import PQueue from 'p-queue';
import { DimToken } from '../../../entities/DimToken';
import { DimAssetType } from '../../../entities/DimAssetType';
import { initializeDataSource } from '../dataSource';
import { Logger, LogLevel } from '../../../utils/logger';
import { NormalizedTokenInput, ITokenRepository } from './types';

// 全局队列，确保所有数据库操作串行执行
const dbQueue = new PQueue({ concurrency: 1 });

export class TokenRepository implements ITokenRepository {
    private logger = Logger.getInstance();

    constructor() {
        this.logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    }

    public async upsertToken(input: NormalizedTokenInput): Promise<DimToken> {
        const dataSource = await initializeDataSource();
        const tokenRepo = dataSource.getRepository(DimToken);
        
        // 记录操作前token数量
        const beforeCount = await tokenRepo.count();
        this.logger.debug(`Before upsert: ${beforeCount} tokens in database`);
        
        try {
            // 查找现有token
            let token = await tokenRepo.findOne({
                where: { address: input.key }
            });
            
            if (!token) {
                this.logger.info(`Creating new token: ${input.key}`);
                token = tokenRepo.create({
                    chainId: 1, // 默认chainId
                    address: input.key,
                    symbol: input.symbol,
                    name: input.name,
                    decimals: input.decimals,
                    assetTypeId: 1, // 默认assetType
                    updatedAt: new Date()
                });
                await tokenRepo.save(token);
                
                // 验证是否创建成功
                const afterCount = await tokenRepo.count();
                if (afterCount <= beforeCount) {
                    throw new Error(`Token creation failed for ${input.key}`);
                }
                this.logger.info(`Successfully created token: ${input.key}`);
            } else {
                this.logger.debug(`Token already exists: ${input.key}`);
            }
            
            return token;
        } catch (error) {
            this.logger.error(`Failed to upsert token ${input.key}`, 
                error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    private async executeInTransaction(input: NormalizedTokenInput): Promise<DimToken> {
        const dataSource = await initializeDataSource();
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.connect();

        try {
            let lastError: Error | null = null;
            const maxRetries = 3;
            let retries = 0;

            while (retries < maxRetries) {
                await queryRunner.startTransaction();
                try {
                    const tokenRepo = queryRunner.manager.getRepository(DimToken);
                    const assetTypeRepo = queryRunner.manager.getRepository(DimAssetType);

                    const assetType = await this.getOrCreateAssetType(assetTypeRepo, input.type);

                    // 预处理rawData，确保所有参数可序列化
                    const processedRawData = this.preprocessRawData(input.rawData);
                    
                    const tokenData = {
                        chain_id: typeof processedRawData?.chainId === 'number' ? processedRawData.chainId : 1,
                        address: input.key,
                        symbol: input.symbol,
                        name: input.name,
                        decimals: input.decimals,
                        asset_type_id: assetType.id,
                        updated_at: new Date(),
                        metadata: {
                            method: processedRawData?.method || null,
                            params: processedRawData?.params || null,
                            eventData: processedRawData?.eventData || null,
                            timestamp: processedRawData?.timestamp || new Date().toISOString()
                        }
                    };

                    const token = await this.doUpsert(tokenRepo, tokenData);
                    await queryRunner.commitTransaction();
                    return token;
                } catch (error) {
                    await queryRunner.rollbackTransaction();
                    lastError = error as Error;
                    this.logger.error(`Failed to upsert token (attempt ${retries + 1}/${maxRetries})`, lastError);
                    retries++;
                    
                    if (retries < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 100 * retries));
                    }
                }
            }
            throw lastError || new Error(`Failed to upsert token after ${maxRetries} attempts`);
        } finally {
            await queryRunner.release();
        }
    }

    private async getOrCreateAssetType(
        repo: any, 
        typeName: string
    ): Promise<DimAssetType> {
        let assetType = await repo.findOne({ where: { name: typeName } });
        if (!assetType) {
            try {
                assetType = await repo.save({
                    name: typeName,
                    description: this.getAssetTypeDescription(typeName)
                });
            } catch (error) {
                assetType = await repo.findOne({ where: { name: typeName } });
                if (!assetType) throw error;
            }
        }
        return assetType;
    }

    private async doUpsert(
        repo: any,
        tokenData: any
    ): Promise<DimToken> {
        // 使用更短的锁持有时间
        let token = await repo.findOne({
            where: {
                chainId: tokenData.chain_id,
                address: tokenData.address
            },
            select: [
                'id',
                'chainId',
                'address',
                'symbol',
                'name',
                'decimals',
                'assetTypeId',
                'updatedAt'
            ],
            lock: { 
                mode: 'pessimistic_write',
                onLocked: 'nowait' // 不等待锁，直接失败
            }
        });

        if (!token) {
            token = await repo.save(repo.create({
                chainId: tokenData.chain_id,
                address: tokenData.address,
                symbol: tokenData.symbol,
                name: tokenData.name,
                decimals: tokenData.decimals,
                assetTypeId: tokenData.asset_type_id,
                updatedAt: tokenData.updated_at
            }));
        } else {
                await repo.update(token.id, {
                    chainId: tokenData.chain_id,
                    address: tokenData.address,
                    symbol: tokenData.symbol,
                    name: tokenData.name,
                    decimals: tokenData.decimals,
                    assetTypeId: tokenData.asset_type_id,
                    totalSupply: tokenData.total_supply || null,
                    updatedAt: tokenData.updated_at
                });
            token = await repo.findOneBy({ id: token.id });
        }

        if (!token?.id) {
            throw new Error('Failed to upsert token');
        }
        return token;
    }

    private preprocessRawData(rawData: any): any {
        if (!rawData) return rawData;

        // 特殊处理currencyId函数
        if (rawData.currencyId && typeof rawData.currencyId === 'function') {
            try {
                rawData = {
                    ...rawData,
                    currencyId: rawData.currencyId()
                };
                this.logger.debug('Processed currencyId function', {
                    original: '[Function]',
                    result: rawData.currencyId
                });
            } catch (e) {
                this.logger.error('Failed to process currencyId function', e instanceof Error ? e : new Error(String(e)));
                rawData.currencyId = null;
            }
        }

        // 处理ForeignAsset类型
        if (rawData.type === 'ForeignAsset') {
            rawData.type = 'ForeignAsset';
            if (rawData.currencyId) {
                rawData.currencyId = rawData.currencyId.toString().replace('ForeignAsset-', '');
            }
        }

        // 深度处理剩余字段
        const processValue = (value: any): any => {
            if (value === null || value === undefined) return value;
            if (typeof value === 'function') return null;
            if (Array.isArray(value)) return value.map(processValue);
            if (typeof value === 'object') {
                const result: Record<string, any> = {};
                for (const key in value) {
                    result[key] = processValue(value[key]);
                }
                return result;
            }
            return value;
        };

        return processValue(rawData);
    }

    private getAssetTypeDescription(typeName: string): string {
        const descriptions: Record<string, string> = {
            'Native': 'Native token of the chain',
            'LP': 'Liquidity Pool Token',
            'Stablecoin': 'Stable value cryptocurrency',
            'ForeignAsset': 'Foreign asset from another chain',
            'DexShare': 'DEX share token',
            'Other': 'Other token type'
        };
        return descriptions[typeName] || typeName;
    }

    public async getAllTokens(): Promise<DimToken[]> {
        const dataSource = await initializeDataSource();
        const tokenRepo = dataSource.getRepository(DimToken);
        return tokenRepo.find({
            select: [
                'id',
                'chainId',
                'address',
                'symbol',
                'name',
                'decimals',
                'assetTypeId',
                'updatedAt'
            ],
            order: {
                symbol: 'ASC'
            }
        });
    }
}
