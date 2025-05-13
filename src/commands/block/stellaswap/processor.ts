import { ApiPromise } from '@polkadot/api';
import { BaseBlockProcessor } from '../BaseBlockProcessor';

export class StellaswapBlockProcessor extends BaseBlockProcessor {
    protected getBlockTime(): number {
        return 12; // Stellaswap block time in seconds
    }

    protected async getChainSpecificInfo(api: ApiPromise): Promise<Record<string, any>> {
        return {}; // Stellaswap doesn't need additional chain specific info
    }
}

export const processor = new StellaswapBlockProcessor();
