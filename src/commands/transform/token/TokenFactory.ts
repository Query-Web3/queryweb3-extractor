import { NormalizedTokenInput, ITokenFactory } from './types';
import { Logger, LogLevel } from '../../../utils/logger';

export class TokenFactory implements ITokenFactory {
    private logger = Logger.getInstance();

    constructor() {
        this.logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    }

    public normalizeInput(rawInput: any): NormalizedTokenInput {
        const tokenTimer = this.logger.time('Normalize token input');
        
        try {
            if (typeof rawInput === 'object' && rawInput !== null) {
                // 处理ForeignAsset格式
                if (rawInput.ForeignAsset) {
                    return this.handleForeignAsset(rawInput);
                }
                // 处理Token格式
                else if (rawInput.Token) {
                    return this.handleToken(rawInput);
                }
                // 处理DexShare格式
                else if (rawInput.DexShare) {
                    return this.handleDexShare(rawInput);
                }
                // 处理其他已知格式
                else if (rawInput.address || rawInput.id) {
                    return this.handlePlainAddress(rawInput);
                }
                // 处理JSON字符串输入
                else if (rawInput.data) {
                    return this.handleJsonInput(rawInput);
                }
            }
            
            // 默认处理字符串/数字输入
            return this.handleDefaultInput(rawInput);
        } finally {
            tokenTimer.end();
        }
    }

    private handleForeignAsset(input: any): NormalizedTokenInput {
        const key = `ForeignAsset-${input.ForeignAsset}`;
        return {
            key,
            symbol: input.symbol || `FA${input.ForeignAsset}`,
            name: input.name || `Foreign Asset ${input.ForeignAsset}`,
            type: 'ForeignAsset',
            decimals: input.decimals || 12,
            rawData: input
        };
    }

    private handleToken(input: any): NormalizedTokenInput {
        const key = `Token-${input.Token}`;
        let symbol = input.symbol || input.Token;
        let name = input.name || `Token ${input.Token}`;
        let decimals = input.decimals || 12;

        // 针对不同Method的特殊处理
        if (input.method) {
            switch(input.method) {
                case 'tokens.transfer':
                    symbol = input.params?.currencyId?.Token || symbol;
                    name = `Transfer Token ${symbol}`;
                    break;
                case 'dex.swapWithExactSupply':
                case 'dex.swapWithExactTarget':
                    symbol = input.params?.path?.[0]?.Token || symbol;
                    name = `Swap Token ${symbol}`;
                    break;
                case 'homa.mint':
                case 'homa.requestRedeem':
                    symbol = 'ACA';
                    name = 'Native Token ACA';
                    break;
            }
        }

        return {
            key,
            symbol,
            name,
            type: this.determineTokenType(input.Token),
            decimals,
            rawData: input
        };
    }

    private handleDexShare(input: any): NormalizedTokenInput {
        const [token1, token2] = input.DexShare;
        const token1Str = token1.Token ? `Token-${token1.Token}` : `ForeignAsset-${token1.ForeignAsset}`;
        const token2Str = token2.Token ? `Token-${token2.Token}` : `ForeignAsset-${token2.ForeignAsset}`;
        const key = `DexShare-${token1Str}-${token2Str}`;
        
        let symbol = input.symbol || `LP-${token1Str.slice(0,5)}-${token2Str.slice(0,5)}`;
        let name = input.name || `Dex Share ${token1Str} ${token2Str}`;
        let decimals = input.decimals || 12;

        // 针对不同Method的特殊处理
        if (input.method) {
            switch(input.method) {
                case 'dex.swapWithExactSupply':
                case 'dex.swapWithExactTarget':
                    const path = input.params?.path || [];
                    if (path.length >= 2) {
                        symbol = `LP-${path[0].Token || path[0].ForeignAsset}-${path[1].Token || path[1].ForeignAsset}`;
                        name = `Swap Pool ${symbol}`;
                    }
                    break;
                case 'dex.addLiquidity':
                case 'dex.removeLiquidity':
                    symbol = `LP-${token1Str.slice(0,5)}-${token2Str.slice(0,5)}`;
                    name = `Liquidity Pool ${symbol}`;
                    break;
            }
        }

        return {
            key,
            symbol,
            name,
            type: 'LP',
            decimals,
            rawData: input
        };
    }

    private handlePlainAddress(input: any): NormalizedTokenInput {
        const key = input.address || input.id;
        return {
            key,
            symbol: input.symbol || key.slice(0, 20),
            name: input.name || key.slice(0, 100),
            type: 'Other',
            decimals: input.decimals || 12,
            rawData: input
        };
    }

    private handleJsonInput(input: any): NormalizedTokenInput {
        try {
            const data = typeof input.data === 'string' ? 
                JSON.parse(input.data) : input.data;
            return this.normalizeInput(data);
        } catch (e) {
            throw new Error(`Invalid token JSON input: ${e}`);
        }
    }

    private handleDefaultInput(input: any): NormalizedTokenInput {
        const key = String(input);
        return {
            key,
            symbol: key,
            name: key,
            type: 'Other',
            decimals: 12,
            rawData: input
        };
    }

    private determineTokenType(tokenSymbol: string): 'Native' | 'Stablecoin' | 'Other' {
        if (tokenSymbol === 'ACA') return 'Native';
        if (tokenSymbol === 'AUSD') return 'Stablecoin';
        return 'Other';
    }
}
