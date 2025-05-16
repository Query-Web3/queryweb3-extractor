import { DataSource } from 'typeorm';
import { DimToken } from '../../../entities/DimToken';
import { DimAssetType } from '../../../entities/DimAssetType';
import { initializeDataSource } from '../dataSource';
import { Logger, LogLevel } from '../../../utils/logger';
import { NormalizedTokenInput, ITokenRepository } from './types';

export class TokenRepository implements ITokenRepository {
    private logger = Logger.getInstance();

    constructor() {
        this.logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    }

    public async upsertToken(input: NormalizedTokenInput): Promise<DimToken> {
        const dataSource = await initializeDataSource();
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.connect();

        try {
            let retries = 5; // 增加重试次数
            let lastError: Error | null = null;
            let delay = 100; // 初始延迟100ms
            
            while (retries-- > 0) {
                await queryRunner.startTransaction();
                try {
                    const tokenRepo = queryRunner.manager.getRepository(DimToken);
                    const assetTypeRepo = queryRunner.manager.getRepository(DimAssetType);

                    // 获取或创建assetType
                    const assetType = await this.getOrCreateAssetType(assetTypeRepo, input.type);

                    // 构建token数据 - 确保chain_id有有效值
                    const chainId = typeof input.rawData?.chainId === 'number' 
                        ? input.rawData.chainId 
                        : 1; // 默认Acala链
                    
                    // 构建token数据 - 包含Method特定信息
                    const tokenData = {
                        chain_id: chainId,
                        address: input.key,
                        symbol: input.symbol,
                        name: input.name,
                        decimals: input.decimals,
                        asset_type_id: assetType.id,
                        updated_at: new Date(),
                        metadata: {
                            method: input.rawData?.method || null,
                            params: input.rawData?.params || null,
                            eventData: input.rawData?.eventData || null,
                            timestamp: input.rawData?.timestamp || new Date().toISOString()
                        }
                    };

                    // 执行upsert操作
                    const token = await this.doUpsert(tokenRepo, tokenData);
                    await queryRunner.commitTransaction();
                    return token;
                } catch (error) {
                    await queryRunner.rollbackTransaction();
                    lastError = error as Error;
                    this.logger.error(`Failed to upsert token (${retries} retries left)`, lastError, {
                        tokenKey: input.key,
                        method: input.rawData?.method,
                        params: input.rawData?.params
                    });
                    
                    if (retries > 0) {
                        // 指数退避策略
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay = Math.min(delay * 2, 2000); // 最大延迟2秒
                        continue;
                    }
                    
                    throw lastError;
                }
            }
            throw lastError || new Error(`Failed to upsert token after 5 retries`);
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
            lock: { mode: 'pessimistic_write' }
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
                updatedAt: tokenData.updated_at
            });
            token = await repo.findOneBy({ id: token.id });
        }

        if (!token?.id) {
            throw new Error('Failed to upsert token');
        }
        return token;
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
}
