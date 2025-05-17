import { createClient } from 'redis';
import { Logger } from '../utils/logger';

const logger = Logger.getInstance();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let client: ReturnType<typeof createClient>;

export async function getRedisClient() {
    if (!client) {
        client = createClient({ 
            url: REDIS_URL,
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > 3) {
                        logger.error('Redis connection failed after 3 retries');
                        return new Error('Redis connection failed');
                    }
                    return Math.min(retries * 100, 5000);
                }
            }
        });
        
        client.on('error', (err) => logger.error('Redis Client Error', err));
        client.on('connect', () => logger.debug('Redis connected'));
        client.on('ready', () => logger.debug('Redis ready'));
        client.on('reconnecting', () => logger.debug('Redis reconnecting'));
        
        await client.connect();
    }
    return client;
}
