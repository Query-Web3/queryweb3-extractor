import { DimToken } from '../../../entities/DimToken';
import { TokenRepository } from './TokenRepository';
import { TokenValidator } from './TokenValidator';
import { TokenFactory } from './TokenFactory';
import { Logger, LogLevel } from '../../../utils/logger';
import { createClient } from 'redis';

export class TokenService {
    private logger = Logger.getInstance();
    private redisClient: ReturnType<typeof createClient>;

    constructor(
        private repository: TokenRepository,
        private validator: TokenValidator,
        private factory: TokenFactory
    ) {
        this.redisClient = createClient({
            url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
        });
        this.redisClient.on('error', err => this.logger.error('Redis error:', err));
        this.logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    }

    public async upsertToken(currencyId: any): Promise<DimToken> {
        const tokenTimer = this.logger.time('Upsert token');
        
        try {
            // 1. 标准化输入
            const normalizedInput = this.factory.normalizeInput(currencyId);
            
            // 2. 尝试Redis操作
            try {
                if (!this.redisClient.isOpen) {
                    await this.redisClient.connect().catch(e => {
                        this.logger.warn('Redis connection failed, proceeding without cache', e);
                        throw e;
                    });
                }

                // 检查Redis缓存
                const cachedTable = await this.redisClient.get('dim_tokens');
                if (cachedTable) {
                    const tokens = JSON.parse(cachedTable);
                    const cachedToken = tokens.find((t: any) => t.address === normalizedInput.key);
                    if (cachedToken) {
                        return cachedToken;
                    }
                }
            } catch (redisError) {
                this.logger.warn('Redis operation failed, proceeding without cache', redisError);
            }

            // 3. 验证输入
            this.validator.validateInput(normalizedInput);

            // 4. 创建/更新token
            const token = await this.repository.upsertToken(normalizedInput);

            // 5. 尝试更新Redis缓存
            try {
                if (this.redisClient.isOpen) {
                    const allTokens = await this.repository.getAllTokens();
                    await this.redisClient.set(
                        'dim_tokens',
                        JSON.stringify(allTokens),
                        { EX: 3600 } // 1小时过期
                    );
                }
            } catch (cacheError) {
                this.logger.warn('Failed to update Redis cache', cacheError);
            }
            
            return token;
        } catch (error) {
            this.logger.error(`Failed to upsert token ${currencyId}`, 
                error instanceof Error ? error : new Error(String(error)));
            throw error;
        } finally {
            tokenTimer.end();
        }
    }
}
