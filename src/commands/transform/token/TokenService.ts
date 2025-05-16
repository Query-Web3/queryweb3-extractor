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
            if (!this.redisClient.isOpen) {
                await this.redisClient.connect();
            }

            // 1. 标准化输入
            const normalizedInput = this.factory.normalizeInput(currencyId);
            
            // 2. 检查Redis缓存
            const cachedToken = await this.redisClient.get(`token:${normalizedInput.key}`);
            if (cachedToken) {
                return JSON.parse(cachedToken);
            }

            // 3. 验证输入
            this.validator.validateInput(normalizedInput);

            // 4. 创建/更新token
            const token = await this.repository.upsertToken(normalizedInput);

            // 5. 更新Redis缓存
            await this.redisClient.set(
                `token:${normalizedInput.key}`, 
                JSON.stringify(token),
                { EX: 3600 } // 1小时过期
            );
            
            return token;
        } finally {
            tokenTimer.end();
        }
    }
}
