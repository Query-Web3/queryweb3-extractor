import { AcalaApiConnector } from './AcalaApiConnector';
import { HydrationApiConnector } from './HydrationApiConnector';
import { BifrostApiConnector } from './BifrostApiConnector';
import { StellaswapApiConnector } from './StellaswapApiConnector';
import { BaseChainApiConnector } from './BaseChainApiConnector';

export class ApiConnectorFactory {
    private static connectors: Record<string, BaseChainApiConnector> = {
        acala: new AcalaApiConnector(),
        hydration: new HydrationApiConnector(),
        bifrost: new BifrostApiConnector(),
        stellswap: new StellaswapApiConnector()
    };

    static getConnector(chain: string): BaseChainApiConnector {
        const connector = this.connectors[chain];
        if (!connector) {
            throw new Error(`Unsupported chain: ${chain}`);
        }
        return connector;
    }
}
