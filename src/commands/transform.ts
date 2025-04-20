import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TokenParams {
    currencyId?: string;
    dest?: string;
    amount?: string;
}

/**
 * Transforms data extracted from the Acala network and populates dimension (DIM) tables.
 * Ensures that basic dimension data exists and transforms token-related data.
 */
export async function transformData() {
    // Log the start of the data transformation process
    console.log('Starting data transformation from Acala to DIM tables...');
    
    try {
        // Ensure basic dimension data (chain information) exists.
        // If the record doesn't exist, create it; otherwise, leave it unchanged.
        await (prisma as any).dimChain.upsert({
            // Query condition to find the record by chain name
            where: { name: 'Acala' },
            // If the record exists, perform no update operations
            update: {},
            // If the record doesn't exist, create a new chain information record
            create: {
                name: 'Acala',
                chainId: 1
            }
        });

        // Transform token data. Find all records in the extrinsic table
        // where the method is 'tokens.transfer' and deduplicate by the params field.
        const tokens = await prisma.extrinsic.findMany({
            where: {
                method: 'tokens.transfer'
            },
            distinct: ['params']
        });

        // Iterate through all found token-related records
        for (const token of tokens) {
            try {
                // Cast the params field to the TokenParams type
                const params = token.params as TokenParams;
                // Check if the currencyId field exists in the params
                if (params?.currencyId) {
                    // Ensure token dimension data exists.
                    // If the record doesn't exist, create it; otherwise, leave it unchanged.
                    await (prisma as any).dimToken.upsert({
                        // Query condition to find the record by chain ID and token address
                        where: {
                            chainId_address: {
                                chainId: 1,
                                address: params.currencyId
                            }
                        },
                        // If the record exists, perform no update operations
                        update: {},
                        // If the record doesn't exist, create a new token information record
                        create: {
                            chainId: 1,
                            address: params.currencyId,
                            // Token symbol, convert currencyId to uppercase
                            symbol: params.currencyId.toUpperCase(),
                            // Token name, use currencyId
                            name: params.currencyId,
                            // Token decimals, default to 18
                            decimals: 18,
                            // Asset type ID, default to 1
                            assetTypeId: 1
                        }
                    });
                }
            } catch (e) {
                // Log the failure to process a token record, including the failed record and error information
                console.error('Failed to process token:', token, e);
            }
        }

        // Log the completion of the data transformation process
        console.log('Data transformation completed');
    } catch (e) {
        // Log the failure of the data transformation, including error information
        console.error('Transform failed:', e);
        // Rethrow the error for the upper caller to handle
        throw e;
    }
}