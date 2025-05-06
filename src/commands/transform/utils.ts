import axios from 'axios';
import { Logger, LogLevel } from '../../utils/logger';

// Get token price from external oracle API
export async function getTokenPriceFromOracle(tokenAddress: string): Promise<number | null> {
    const logger = Logger.getInstance();
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    
    const priceTimer = logger.time('Get token price');
    try {
        logger.debug(`Fetching price for token ${tokenAddress}`);
        
        // Query coingecko API for token price
        const response = await axios.get(`https://api.coingecko.com/api/v3/simple/token_price/acala`, {
            params: {
                contract_addresses: tokenAddress,
                vs_currencies: 'usd'
            }
        });

        if (response.data[tokenAddress.toLowerCase()]?.usd) {
            const price = response.data[tokenAddress.toLowerCase()].usd;
            logger.debug(`Got price from Coingecko: ${price}`);
            priceTimer.end();
            return price;
        }

        logger.debug('No price found on Coingecko, trying Acala oracle');
        
        // Fallback to Acala's oracle if Coingecko doesn't have the price
        const acalaResponse = await axios.get(`https://oracle.acala.network/api/price`, {
            params: {
                token: tokenAddress
            }
        });

        const price = acalaResponse.data?.price || null;
        if (price) {
            logger.debug(`Got price from Acala oracle: ${price}`);
        } else {
            logger.warn('No price found from any oracle');
        }
        
        priceTimer.end();
        return price;
    } catch (error) {
        logger.error('Failed to fetch token price', error as Error, {
            tokenAddress
        });
        priceTimer.end();
        return null;
    }
}
