import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TokenParams {
    currencyId?: string;
    dest?: string;
    amount?: string;
}

export async function transformData() {
    console.log('Starting data transformation from Acala to DIM tables...');
    
    try {
        // 确保基础维度数据存在
        await (prisma as any).dimChain.upsert({
            where: { name: 'Acala' },
            update: {},
            create: {
                name: 'Acala',
                chainId: 1
            }
        });

        // 转换代币数据
        const tokens = await prisma.extrinsic.findMany({
            where: {
                method: 'tokens.transfer'
            },
            distinct: ['params']
        });

        for (const token of tokens) {
            try {
                const params = token.params as TokenParams;
                if (params?.currencyId) {
                    await (prisma as any).dimToken.upsert({
                        where: {
                            chainId_address: {
                                chainId: 1,
                                address: params.currencyId
                            }
                        },
                        update: {},
                        create: {
                            chainId: 1,
                            address: params.currencyId,
                            symbol: params.currencyId.toUpperCase(),
                            name: params.currencyId,
                            decimals: 18,
                            assetTypeId: 1
                        }
                    });
                }
            } catch (e) {
                console.error('Failed to process token:', token, e);
            }
        }

        console.log('Data transformation completed');
    } catch (e) {
        console.error('Transform failed:', e);
        throw e;
    }
}