import axios from 'axios';
import { getRedisClient } from '../../common/redis';
import { Logger, LogLevel } from '../../utils/logger';
import WebSocket, { MessageEvent } from 'ws';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { options } from '@acala-network/api';
import { TokenRepository } from './token/TokenRepository';

// Redis price cache key
const PRICE_CACHE_KEY = 'token:price:cache';
const CACHE_TTL = 5 * 60; // 5 minutes cache in seconds

// Binance WebSocket client
let binanceWS: WebSocket | null = null;
let binancePrice = 0;
let lastBinanceUpdate = 0;

// Initialize Binance WebSocket
function initBinanceWS() {
    if (binanceWS) return;

    binanceWS = new WebSocket('wss://data-stream.binance.vision/ws/acausdt@ticker');
    
    binanceWS.on('open', () => {
        Logger.getInstance().debug('Binance WebSocket connected');
    });

    binanceWS.on('message', (data: MessageEvent) => {
        try {
            const ticker = JSON.parse(data.toString());
            binancePrice = parseFloat(ticker.c);
            lastBinanceUpdate = Date.now();
        } catch (error) {
            Logger.getInstance().warn('Failed to parse Binance WS message', error);
        }
    });

    binanceWS.on('close', () => {
        Logger.getInstance().warn('Binance WebSocket disconnected');
        binanceWS = null;
        setTimeout(initBinanceWS, 5000); // Reconnect after 5s
    });

    binanceWS.on('error', (error: Error) => {
        Logger.getInstance().warn('Binance WebSocket error', error);
    });
}

// Acala API instance
let acalaApi: ApiPromise | null = null;

// Initialize Acala API
async function initAcalaApi() {
    if (acalaApi) return acalaApi;
    
    const logger = Logger.getInstance();
    try {
        const provider = new WsProvider('wss://acala-rpc-0.aca-api.network');
        acalaApi = await ApiPromise.create(options({ provider }));
        logger.debug('Acala API connected');
        return acalaApi;
    } catch (error) {
        logger.warn('Failed to connect to Acala API', error);
        return null;
    }
}

// Get token price from Acala Swap or Oracle
async function getTokenPrice(tokenAddress: string): Promise<number | null> {
    const logger = Logger.getInstance();
    try {
        const api = await initAcalaApi();
        if (!api) return null;

        // Check if token is ACA or AUSD
        if (tokenAddress === 'ACA') {
            // Get ACA/AUSD price from DEX
            const result = await api.query.dex.liquidityPool([
                { token: 'ACA' }, 
                { token: 'AUSD' }
            ]);
            const [acaAmount, ausdAmount] = result.toJSON() as [string, string];
            if (!acaAmount || !ausdAmount) return null;
            return Number(ausdAmount) / Number(acaAmount);
        } 
        else if (tokenAddress === 'AUSD') {
            return 1.0; // AUSD is stablecoin pegged to 1 USD
        }
        else {
            // For other tokens, try to get price from oracle
            try {
                if (!tokenAddress || typeof tokenAddress !== 'string') {
                    logger.warn(`Invalid token address: ${tokenAddress}`);
                    return null;
                }

                // Check if token is supported by Acala
                if (tokenAddress.startsWith('ForeignAsset-') || tokenAddress.startsWith('Token-')) {
                    logger.debug(`Unsupported token type detected (${tokenAddress}), using ACA price as fallback`);
                    const acaPrice = await getTokenPrice('ACA');
                    return acaPrice ?? 1.0; // Fallback to 1.0 if ACA price not available
                }
                
                const oraclePrice = await api.query.oracle.values(tokenAddress);
                if (!oraclePrice || oraclePrice.isEmpty) {
                    logger.debug(`No oracle price available for ${tokenAddress}`);
                    return null;
                }
                
                const priceData = oraclePrice.toJSON();
                if (priceData && typeof priceData === 'object' && 'price' in priceData) {
                    const priceValue = Number(priceData.price);
                    if (!isNaN(priceValue)) {
                        return priceValue;
                    }
                }
                logger.warn(`Invalid oracle price format for ${tokenAddress}`, priceData);
            } catch (error) {
                logger.warn(`Failed to get oracle price for ${tokenAddress}`, error);
                // For ForeignAsset errors, fallback to ACA price
                if (tokenAddress.startsWith('ForeignAsset-')) {
                    logger.debug(`Using ACA price as fallback for ${tokenAddress}`);
                    const acaPrice = await getTokenPrice('ACA');
                    return acaPrice ?? 1.0;
                }
            }
            
            // Fallback to DEX if available
            try {
                const result = await api.query.dex.liquidityPool([
                    { token: tokenAddress },
                    { token: 'AUSD' }
                ]);
                const [tokenAmount, ausdAmount] = result.toJSON() as [string, string];
                if (tokenAmount && ausdAmount) {
                    return Number(ausdAmount) / Number(tokenAmount);
                }
            } catch (error) {
                logger.warn(`Failed to get DEX price for ${tokenAddress}`, error);
            }
        }
        
        return null;
    } catch (error) {
        logger.warn(`Failed to get price for ${tokenAddress}`, error);
        return null;
    }
}

// Token repository for fetching token data
const tokenRepo = new TokenRepository();

// Get token symbol to address mapping from database
async function getTokenSymbolMap(): Promise<Record<string, string>> {
    const tokens = await tokenRepo.getAllTokens();
    const symbolMap: Record<string, string> = {};
    
    for (const token of tokens) {
        symbolMap[token.symbol] = token.address;
    }
    
    return symbolMap;
}

// Get token price by symbol
export async function getTokenPriceBySymbol(tokenSymbol: string): Promise<number | null> {
    const symbolMap = await getTokenSymbolMap();
    const tokenAddress = symbolMap[tokenSymbol];
    
    // Only use original logic for these specific symbols
    const supportedSymbols = new Set(['ACA', 'AUSD', 'DOT', 'LDOT', 'USDT', 'TAP']);
    
    if (tokenAddress && supportedSymbols.has(tokenSymbol)) {
        return getTokenPriceFromOracle(tokenAddress);
    }
    // Fallback to ACA price for all other symbols
    return getTokenPriceFromOracle('ACA');
}

// Get token price from oracle APIs
export async function getTokenPriceFromOracle(tokenAddress: string): Promise<number | null> {
    const logger = Logger.getInstance();
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    
    const priceTimer = logger.time(`Get price for ${tokenAddress}`);
    
    // Check Redis cache first
    try {
        const redis = await getRedisClient();
        const cachedPrice = await redis.sendCommand(['HGET', PRICE_CACHE_KEY, tokenAddress]);
        if (cachedPrice && typeof cachedPrice === 'string') {
            try {
                const parsed = JSON.parse(cachedPrice);
                if (parsed && typeof parsed.price === 'number' && typeof parsed.timestamp === 'number') {
                    const { price, timestamp } = parsed;
                    if (Date.now() - timestamp < CACHE_TTL * 1000) {
                        logger.debug(`Using Redis cached price for ${tokenAddress}: ${price}`);
                        priceTimer.end();
                        return price;
                    }
                }
            } catch (error) {
                logger.warn('Failed to parse cached price', error);
            }
        }
    } catch (error) {
        logger.warn('Failed to check Redis price cache', error);
    }

    // Try to get price from Acala network first
    const tokenPrice = await getTokenPrice(tokenAddress);
    if (tokenPrice !== null) {
        logger.debug(`Got price for ${tokenAddress} from Acala: ${tokenPrice}`);
        console.log(`[${tokenAddress} Price] Current price: $${tokenPrice.toFixed(8)} (from Acala)`);
        // Update Redis cache
        try {
            const redis = await getRedisClient();
            await redis.sendCommand([
                'HSET', 
                PRICE_CACHE_KEY, 
                tokenAddress,
                JSON.stringify({price: tokenPrice, timestamp: Date.now()})
            ]);
            await redis.sendCommand(['EXPIRE', PRICE_CACHE_KEY, CACHE_TTL.toString()]);
        } catch (error) {
            logger.warn('Failed to update Redis price cache', error);
        }
        priceTimer.end();
        return tokenPrice;
    }

    // For non-ACA tokens, fallback to external APIs
    if (tokenAddress !== 'ACA') {
        priceTimer.end();
        return 1.0; // Default fallback for unknown tokens
    }

    // For ACA token, use existing fallback logic
    if (!binancePrice || Date.now() - lastBinanceUpdate >= 30000) {
        logger.debug('Waiting for fresh WebSocket price...');
        try {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s for WS update
        } catch (error) {
            logger.warn('Error waiting for WebSocket price', error);
        }
    }

    if (binancePrice && Date.now() - lastBinanceUpdate < 30000) { // 30s freshness
        logger.debug(`Using Binance WS price: ${binancePrice}`);
        console.log(`[ACA Price] Current price: $${binancePrice.toFixed(4)}`);
        // Update Redis cache
        try {
            const redis = await getRedisClient();
            await redis.sendCommand([
                'HSET',
                PRICE_CACHE_KEY,
                tokenAddress,
                JSON.stringify({price: binancePrice, timestamp: Date.now()})
            ]);
            await redis.sendCommand(['EXPIRE', PRICE_CACHE_KEY, CACHE_TTL.toString()]);
        } catch (error) {
            logger.warn('Failed to update Redis price cache', error);
        }
        priceTimer.end();
        return binancePrice;
    }

    logger.debug('WebSocket price not available, falling back to HTTP APIs');
    const priceSources = [
        {
            name: 'CoinMarketCap China',
            url: 'https://web-api.coinmarketcap.cn/v1/cryptocurrency/quotes/latest',
            params: {symbol: tokenAddress, convert: 'USD'},
            extract: (data: any) => data.data?.[tokenAddress]?.quote?.USD?.price
        },
        {
            name: 'CoinGecko International',
            url: 'https://api.coingecko.com/api/v3/simple/price',
            params: {ids: 'acala', vs_currencies: 'usd'},
            extract: (data: any) => data.acala?.usd
        },
        {
            name: 'Binance API',
            url: 'https://api.binance.com/api/v3/ticker/price',
            params: {symbol: 'ACAUSDT'},
            extract: (data: any) => data.price
        },
        {
            name: 'OKX API',
            url: 'https://www.okx.com/api/v5/market/ticker',
            params: {instId: 'ACA-USDT'},
            extract: (data: any) => data.data?.[0]?.last
        }
    ];

    // Try available sources
    for (const source of priceSources) {
        for (let i = 0; i < 3; i++) { // 3 retries
            try {
                logger.debug(`Trying ${source.name} (attempt ${i+1})`);
                const response = await axios.get(source.url, {
                    params: source.params,
                    timeout: 8000,
                    headers: {
                        'User-Agent': 'Acala-ETL/1.0'
                    }
                });

                const price = source.extract(response.data);
                if (price) {
                    const priceNum = parseFloat(price);
                    logger.debug(`Got price from ${source.name}: ${priceNum}`);
                    console.log(`[ACA Price] Current price: $${priceNum.toFixed(4)} (from ${source.name})`);
                    // Update Redis cache
                    try {
                    const redis = await getRedisClient();
                    await redis.sendCommand([
                        'HSET',
                        PRICE_CACHE_KEY,
                        tokenAddress,
                        JSON.stringify({price: priceNum, timestamp: Date.now()})
                    ]);
                    await redis.sendCommand(['EXPIRE', PRICE_CACHE_KEY, CACHE_TTL.toString()]);
                    } catch (error) {
                        logger.warn('Failed to update Redis price cache', error);
                    }
                    priceTimer.end();
                    return priceNum;
                }
            } catch (error) {
                logger.warn(`${source.name} attempt ${i+1} failed`, error);
                if (i < 2) await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
            }
        }
    }

    logger.error('All price source attempts failed');
    priceTimer.end();
    
    // Try to get last cached price from Redis
    try {
        const redis = await getRedisClient();
        const cachedPrice = await redis.sendCommand(['HGET', PRICE_CACHE_KEY, tokenAddress]);
        if (cachedPrice && typeof cachedPrice === 'string') {
            try {
                const parsed = JSON.parse(cachedPrice);
                if (parsed && typeof parsed.price === 'number') {
                    const { price } = parsed;
                    logger.warn(`Using expired Redis cached price for ${tokenAddress}: ${price}`);
                    console.log(`[ACA Price] Using cached price: $${price.toFixed(4)} (expired)`);
                    return price;
                }
            } catch (error) {
                logger.warn('Failed to parse cached price', error);
            }
        }
    } catch (error) {
        logger.warn('Failed to check Redis price cache', error);
    }

    logger.warn('No cached price available, using default price: $1.0000');
    return 1.0; // Default fallback value
}

// Initialize WebSocket on module load
initBinanceWS();
