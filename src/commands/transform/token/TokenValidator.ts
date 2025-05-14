import { NormalizedTokenInput, ITokenValidator } from './types';
import { Logger, LogLevel } from '../../../utils/logger';

export class TokenValidator implements ITokenValidator {
    private logger = Logger.getInstance();

    constructor() {
        this.logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    }

    public validateInput(input: NormalizedTokenInput): void {
        const validationTimer = this.logger.time('Validate token input');
        
        try {
            // 验证key
            if (!input.key || input.key.length > 100) {
                throw new Error(`Invalid token key: ${input.key}`);
            }

            // 验证symbol
            if (!input.symbol || input.symbol.length > 20) {
                throw new Error(`Invalid token symbol: ${input.symbol}`);
            }

            // 验证name
            if (!input.name || input.name.length > 100) {
                throw new Error(`Invalid token name: ${input.name}`);
            }

            // 验证decimals
            if (input.decimals < 0 || input.decimals > 18) {
                throw new Error(`Invalid token decimals: ${input.decimals}`);
            }

            // 验证type
            const validTypes = ['Native', 'LP', 'Stablecoin', 'ForeignAsset', 'DexShare', 'Other'];
            if (!validTypes.includes(input.type)) {
                throw new Error(`Invalid token type: ${input.type}`);
            }

            this.logger.debug(`Token input validation passed for ${input.key}`);
        } finally {
            validationTimer.end();
        }
    }
}
