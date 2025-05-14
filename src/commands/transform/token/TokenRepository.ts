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
            let retries = 3;
            let lastError: Error | null = null;
            
            while (retries-- > 0) {
                await queryRunner.startTransaction();
                try {
                    const tokenRepo = queryRunner.manager.getRepository(DimToken);
                    const assetTypeRepo = queryRunner.manager.getRepository(DimAssetType);

                    // 获取或创建assetType
                    const assetType = await this.getOrCreateAssetType(assetTypeRepo, input.type);

                    // 构建token数据
                    const tokenData = {
                        chainId: 1,
                        address: input.key,
                        symbol: input.symbol,
                        name: input.name,
                        decimals: input.decimals,
                        assetTypeId: assetType.id,
                        updatedAt: new Date()
                    };

                    // 执行upsert操作
                    const token = await this.doUpsert(tokenRepo, tokenData);
                    await queryRunner.commitTransaction();
                    return token;
                } catch (error) {
                    await queryRunner.rollbackTransaction();
                    lastError = error as Error;
                    continue;
                }
            }
            throw lastError || new Error(`Failed to upsert token after 3 retries`);
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
        // 先尝试获取现有token
        let token = await repo.createQueryBuilder()
            .where('chainId = :chainId AND address = :address', {
                chainId: tokenData.chainId,
                address: tokenData.address
            })
            .setLock('pessimistic_write')
            .getOne();

        if (!token) {
            token = await repo.save(tokenData);
        } else {
            token = await repo.save({ ...token, ...tokenData });
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
