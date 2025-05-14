import { DimToken } from '../../../entities/DimToken';
import { TokenRepository } from './TokenRepository';
import { TokenValidator } from './TokenValidator';
import { TokenFactory } from './TokenFactory';
import { Logger, LogLevel } from '../../../utils/logger';

export class TokenService {
    private logger = Logger.getInstance();
    private tokenCache = new Map<string, DimToken>();

    constructor(
        private repository: TokenRepository,
        private validator: TokenValidator,
        private factory: TokenFactory
    ) {
        this.logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    }

    public async upsertToken(currencyId: any): Promise<DimToken> {
        const tokenTimer = this.logger.time('Upsert token');
        
        try {
            // 1. 标准化输入
            const normalizedInput = this.factory.normalizeInput(currencyId);
            
            // 2. 检查缓存
            if (this.tokenCache.has(normalizedInput.key)) {
                return this.tokenCache.get(normalizedInput.key)!;
            }

            // 3. 验证输入
            this.validator.validateInput(normalizedInput);

            // 4. 创建/更新token
            const token = await this.repository.upsertToken(normalizedInput);

            // 5. 更新缓存
            this.tokenCache.set(normalizedInput.key, token);
            return token;
        } finally {
            tokenTimer.end();
        }
    }
}
