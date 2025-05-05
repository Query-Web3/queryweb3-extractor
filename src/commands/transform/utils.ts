import axios from 'axios';

// Get token price from external oracle API
export async function getTokenPriceFromOracle(tokenAddress: string): Promise<number | null> {
    try {
        // Query coingecko API for token price
        const response = await axios.get(`https://api.coingecko.com/api/v3/simple/token_price/acala`, {
            params: {
                contract_addresses: tokenAddress,
                vs_currencies: 'usd'
            }
        });

        if (response.data[tokenAddress.toLowerCase()]?.usd) {
            return response.data[tokenAddress.toLowerCase()].usd;
        }

        // Fallback to Acala's oracle if Coingecko doesn't have the price
        const acalaResponse = await axios.get(`https://oracle.acala.network/api/price`, {
            params: {
                token: tokenAddress
            }
        });

        return acalaResponse.data?.price || null;
    } catch (error) {
        console.error('Failed to fetch token price:', error);
        return null;
    }
}
