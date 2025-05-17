import { createClient } from 'redis';
import { Logger } from '../utils/logger';

const logger = Logger.getInstance();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let client: ReturnType<typeof createClient>;

export async function getRedisClient() {
    if (!client) {
        client = createClient({ url: REDIS_URL });
        client.on('error', (err) => logger.error('Redis Client Error', err));
        await client.connect();
    }
    return client;
}
