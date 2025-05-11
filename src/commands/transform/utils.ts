import axios from 'axios';
import { Logger, LogLevel } from '../../utils/logger';

// Get token price from external oracle API
export async function getTokenPriceFromOracle(tokenAddress: string): Promise<number | null> {
    const logger = Logger.getInstance();
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    
    const priceTimer = logger.time('Get token price');
    let lastError: Error | null = null;
    
    // Try Coingecko API first with retry
    for (let i = 0; i < 3; i++) {
        try {
            logger.debug(`Fetching price for token ${tokenAddress} from Coingecko (attempt ${i+1})`);
            
            // Try both main and alternative endpoints
            const endpoints = [
                `https://api.coingecko.com/api/v3/simple/token_price/acala`,
                `https://pro-api.coingecko.com/api/v3/simple/token_price/acala`
            ];

            for (const endpoint of endpoints) {
                try {
                    const response = await axios.get(endpoint, {
                        params: {
                            contract_addresses: tokenAddress,
                            vs_currencies: 'usd',
                            x_cg_pro_api_key: process.env.COINGECKO_API_KEY || ''
                        },
                        timeout: 5000
                    });

                    if (response.data[tokenAddress.toLowerCase()]?.usd) {
                        const price = response.data[tokenAddress.toLowerCase()].usd;
                        logger.debug(`Got price from Coingecko (${endpoint}): ${price}`);
                        priceTimer.end();
                        return price;
                    }
                } catch (endpointError) {
                    logger.warn(`Coingecko endpoint ${endpoint} attempt ${i+1} failed`, endpointError as Error);
                    if (i < 2) await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
                }
            }
        } catch (error) {
            lastError = error as Error;
            logger.warn(`Coingecko API attempt ${i+1} failed`, error as Error);
            if (i < 2) await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            continue;
        }
        break;
    }

    // Fallback to Acala oracle with retry
    for (let i = 0; i < 3; i++) {
        try {
            logger.debug(`Fetching price for token ${tokenAddress} from Acala oracle (attempt ${i+1})`);
            
            const acalaResponse = await axios.get(`https://oracle.acala.network/api/price`, {
                params: { token: tokenAddress },
                timeout: 5000
            });

            const price = acalaResponse.data?.price || null;
            if (price) {
                logger.debug(`Got price from Acala oracle: ${price}`);
                priceTimer.end();
                return price;
            }
        } catch (error) {
            lastError = error as Error;
            logger.warn(`Acala oracle attempt ${i+1} failed`, error as Error);
            if (i < 2) await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            continue;
        }
        break;
    }

    if (lastError) {
        logger.error('All price oracle attempts failed', lastError);
    } else {
        logger.error('All price oracle attempts failed - no price data available');
    }
    priceTimer.end();
    return null;
}
