import axios from 'axios';
import { getRedisClient } from '../../common/redis';
import { Logger, LogLevel } from '../../utils/logger';
import WebSocket, { MessageEvent } from 'ws';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { options } from '@acala-network/api';

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

// Get token price from Acala Swap
async function getPriceFromAcalaSwap(): Promise<number | null> {
    const logger = Logger.getInstance();
    try {
        const api = await initAcalaApi();
        if (!api) return null;
        
        // Query the dex module for ACA/AUSD price using token symbols directly
        const result = await api.query.dex.liquidityPool([
            { token: 'ACA' }, 
            { token: 'AUSD' }
        ]);
        const [acaAmount, ausdAmount] = result.toJSON() as [string, string];
        
        if (!acaAmount || !ausdAmount) return null;
        
        const price = Number(ausdAmount) / Number(acaAmount);
        logger.debug(`Got price from Acala Swap: ${price}`);
        return price;
    } catch (error) {
        logger.warn('Failed to get price from Acala Swap', error);
        return null;
    }
}

// Get token price from oracle APIs
export async function getTokenPriceFromOracle(tokenAddress: string): Promise<number | null> {
    const logger = Logger.getInstance();
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    
    const priceTimer = logger.time('Get token price');
    
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

    // Try Acala Swap first
    const acalaPrice = await getPriceFromAcalaSwap();
    if (acalaPrice) {
        logger.debug(`Using Acala Swap price: ${acalaPrice}`);
        console.log(`[ACA Price] Current price: $${acalaPrice.toFixed(8)} (from Acala Swap)`);
        // Update Redis cache
        try {
            const redis = await getRedisClient();
            await redis.sendCommand([
                'HSET', 
                PRICE_CACHE_KEY, 
                tokenAddress,
                JSON.stringify({price: acalaPrice, timestamp: Date.now()})
            ]);
            await redis.sendCommand(['EXPIRE', PRICE_CACHE_KEY, CACHE_TTL.toString()]);
        } catch (error) {
            logger.warn('Failed to update Redis price cache', error);
        }
        priceTimer.end();
        return acalaPrice;
    }

    // Wait for WebSocket price with timeout
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
            params: {symbol: 'ACA', convert: 'USD'},
            extract: (data: any) => data.data?.ACA?.quote?.USD?.price
        },
        {
            name: 'CoinGecko China Mirror',
            url: 'https://api.coingecko.cn/api/v3/simple/price',
            params: {ids: 'acala', vs_currencies: 'usd'},
            extract: (data: any) => data.acala?.usd
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
    console.log('[ACA Price] Using default price: $1.0000');
    return 1.0; // Default fallback value
}

// Initialize WebSocket on module load
initBinanceWS();
