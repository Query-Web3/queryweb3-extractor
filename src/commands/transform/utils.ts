import axios from 'axios';
import { Logger, LogLevel } from '../../utils/logger';
import WebSocket, { MessageEvent } from 'ws';

// Price cache
const priceCache = new Map<string, {price: number, timestamp: number}>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

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

// Get token price from oracle APIs
export async function getTokenPriceFromOracle(tokenAddress: string): Promise<number | null> {
    const logger = Logger.getInstance();
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    
    const priceTimer = logger.time('Get token price');
    
    // Check cache first
    const cached = priceCache.get(tokenAddress);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        logger.debug(`Using cached price for ${tokenAddress}: ${cached.price}`);
        priceTimer.end();
        return cached.price;
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
        priceCache.set(tokenAddress, {price: binancePrice, timestamp: Date.now()});
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
                    priceCache.set(tokenAddress, {price: priceNum, timestamp: Date.now()});
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
