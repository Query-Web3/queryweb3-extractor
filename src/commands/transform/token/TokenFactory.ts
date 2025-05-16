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
                // 处理AcalaEvents.data中的currentId对象
                if (rawInput.currentId) {
                    this.logger.debug('Processing currentId object', {
                        originalInput: rawInput,
                        currentId: rawInput.currentId
                    });
                    return this.normalizeInput(rawInput.currentId);
                }
                // 处理ForeignAsset格式
                else if (rawInput.ForeignAsset) {
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
        let key = input.address || input.id;
        if (typeof key === 'object') {
            // 尝试从currentId对象中提取有效字段
            if (key.Token) {
                key = `Token-${key.Token}`;
            } else if (key.ForeignAsset) {
                key = `ForeignAsset-${key.ForeignAsset}`;
            } else if (key.DexShare) {
                const [token1, token2] = key.DexShare;
                const token1Str = token1.Token ? `Token-${token1.Token}` : `ForeignAsset-${token1.ForeignAsset}`;
                const token2Str = token2.Token ? `Token-${token2.Token}` : `ForeignAsset-${token2.ForeignAsset}`;
                key = `DexShare-${token1Str}-${token2Str}`;
            } else {
                this.logger.debug('Processing object input in handlePlainAddress', {
                    originalInput: input,
                    convertedKey: JSON.stringify(key)
                });
                key = JSON.stringify(key);
            }
        }
        let type: 'Native' | 'LP' | 'Stablecoin' | 'ForeignAsset' | 'DexShare' | 'ERC20' | 'Other' = 'Other';
        
        // 根据key格式推断类型
        if (key.startsWith('LP-')) {
            type = 'LP';
        } else if (key.startsWith('FA')) {
            type = 'ForeignAsset';
        } else if (key.startsWith('0x') && key.length === 42) {
            type = 'ERC20';
        } else if (key === 'ACA') {
            type = 'Native';
        } else if (key === 'AUSD') {
            type = 'Stablecoin';
        }

        return {
            key,
            symbol: input.symbol || key.slice(0, 20),
            name: input.name || key.slice(0, 100),
            type,
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
        let key = String(input);
        let type: 'Native' | 'LP' | 'Stablecoin' | 'ForeignAsset' | 'DexShare' | 'ERC20' | 'Other' = 'Other';
        
        if (typeof input === 'object' && input !== null) {
            // 尝试从对象中提取简明信息
            if (input.symbol) {
                key = input.symbol;
            } else if (input.name) {
                key = input.name;
            } else if (input.id) {
                key = String(input.id);
            } else if (input.address) {
                key = String(input.address);
            } else {
                // 对于复杂对象，创建更简洁的表示
                const keys = Object.keys(input);
                if (keys.length === 1) {
                    key = `${keys[0]}:${input[keys[0]]}`;
                } else {
                    key = keys.slice(0, 2).map(k => `${k}:${input[k]}`).join('|');
                }
            }
            
            this.logger.debug('Processing object input in handleDefaultInput', {
                originalInput: input,
                convertedKey: key
            });
        }
        
        // 根据key格式推断类型
        if (typeof input === 'string') {
            if (input.startsWith('LP-')) {
                type = 'LP';
            } else if (input.startsWith('FA')) {
                type = 'ForeignAsset';
            } else if (input.startsWith('0x') && input.length === 42) {
                type = 'ERC20';
            } else if (input === 'ACA') {
                type = 'Native';
            } else if (input === 'AUSD') {
                type = 'Stablecoin';
            }
        }

        return {
            key,
            symbol: key.slice(0, 20),
            name: key.slice(0, 100),
            type,
            decimals: 12,
            rawData: input
        };
    }

    private determineTokenType(tokenSymbol: string): 'Native' | 'Stablecoin' | 'LP' | 'ForeignAsset' | 'ERC20' | 'Other' {
        if (tokenSymbol === 'ACA') return 'Native';
        if (tokenSymbol === 'AUSD') return 'Stablecoin';
        if (tokenSymbol.startsWith('LP-')) return 'LP';
        if (tokenSymbol.startsWith('FA')) return 'ForeignAsset';
        if (tokenSymbol.startsWith('0x') && tokenSymbol.length === 42) return 'ERC20';
        return 'Other';
    }
}
