import { DataSource } from 'typeorm';
import { AcalaBlock } from '../../entities/acala/AcalaBlock';
import { AcalaExtrinsic } from '../../entities/acala/AcalaExtrinsic';
import { AcalaEvent } from '../../entities/acala/AcalaEvent';
import { ApiPromise } from '@polkadot/api';
import { initializeDataSource } from './dataSource';

interface PaymentInfo {
    partialFee: {
        toString: () => string;
    };
    toHuman: () => Record<string, any>;
}

/**
 * Processes a single block, extracting extrinsics and events, and saves them to the database.
 * 
 * @param block - An object containing block number, hash, and hash object.
 * @param workerId - The ID of the worker processing this block.
 * @param api - The Polkadot API promise instance for interacting with the blockchain.
 * @param batchId - The unique identifier for the current batch.
 * @returns An object containing block information on success, or error details on failure.
 */
export async function processBlock(
    block: {
        number: number;
        hash: string;
        hashObj: any;
        acalaData?: {
            dexPools: Array<{
                poolId: string;
                liquidity: string;
            }>;
            stableCoinBalances: Array<{
                accountId: string;
                position: string;
            }>;
        };
    },
    workerId: number,
    api: ApiPromise,
    batchId: string
) {
    try {
        // Check if the API is initialized
        if (!api) throw new Error('API not initialized');
        
        // Fetch the signed block from the blockchain
        const signedBlock = await api.rpc.chain.getBlock(block.hashObj);
        // Fetch the system events for the block (Note: 'at' method is deprecated)
        const events = await api.query.system.events.at(block.hashObj);

        // Process each extrinsic in the block
        const extrinsics = await Promise.all(signedBlock.block.extrinsics.map(async (ext: any, index: number) => {
            let fee = '0';
            try {
                // Check if the extrinsic is signed and the API is connected
                if (ext && ext.isSigned && ext.signer && ext.method && api && api.isConnected) {
                    console.log(`Getting payment info for extrinsic ${index} with signer ${ext.signer.toString()}`);
                    
                    // Check if the extrinsic method exists in the API
                    if (!api.tx[ext.method.section]?.[ext.method.method]) {
                        console.warn(`Extrinsic method ${ext.method.section}.${ext.method.method} not found in API`);
                        fee = '0';
                    } else {
                        // Create a transaction object
                        const tx = api.tx(ext.method);
                        if (!tx || !tx.isSigned) {
                            console.log(`Skipping payment info for unsigned extrinsic ${index} because of tx is not signed`);
                            fee = '0';
                        } else {
                            try {
                                // Get the payment info for the transaction with a 5-second timeout
                                const paymentInfo = await Promise.race<PaymentInfo>([
                                    tx.paymentInfo(ext.signer),
                                    new Promise<PaymentInfo>((_, reject) => 
                                        setTimeout(() => reject(new Error('Payment info timeout')), 5000)
                                    )
                                ]);
                                if (paymentInfo?.partialFee) {
                                    fee = paymentInfo.partialFee.toString();
                                    console.log(`Payment info for extrinsic ${index}: ${JSON.stringify(paymentInfo.toHuman())}`);
                                }
                            } catch (e) {
                                console.error(`Failed to get payment info for extrinsic ${index}:`, e);
                            }
                        }
                    }
                } else if (!ext.signer) {
                    console.log(`Skipping payment info for unsigned extrinsic ${index} because of missing signer`);
                }
            } catch (e) {
                console.error(`Failed to process extrinsic ${index}:`, e);
            }
            
            // Determine extrinsic status
            let status = 'pending';
            if (!ext.isSigned || !ext.signer) {
                status = 'unsigned';
            }
            
            // Return the processed extrinsic information
            return {
                index,
                method: `${ext.method.section}.${ext.method.method}`,
                signer: ext.signer?.toString() || null,
                fee,
                status,
                params: ext.method.toHuman()
            };
        }));

        // Initialize the database connection
        const dataSource = await initializeDataSource();
        // Create a query runner for transaction management
        const queryRunner = dataSource.createQueryRunner();
        // Connect to the database
        await queryRunner.connect();
        // Start a database transaction
        await queryRunner.startTransaction();
        
        try {
            // Save the block information to the database
            const blockRecord = await queryRunner.manager.getRepository(AcalaBlock).save({
                number: block.number,
                hash: block.hash,
                batchId,
                acalaData: block.acalaData || null
            });
            
            if (extrinsics.length > 0) {
                // Save each extrinsic to the database if it doesn't already exist
                const createdExtrinsics = await Promise.all(extrinsics.map(async ext => {
                    const existing = await queryRunner.manager.getRepository(AcalaExtrinsic).findOne({
                        where: { blockId: blockRecord.id, index: ext.index }
                    });
                    return existing || await queryRunner.manager.getRepository(AcalaExtrinsic).save({
                        blockId: blockRecord.id,
                        ...ext,
                        batchId
                    });
                }));

                // Save each event to the database if it doesn't already exist
                await Promise.all((events as unknown as any[]).map(async (record: any, index: number) => {
                    const { event, phase } = record;
                    const extrinsicId = phase.isApplyExtrinsic
                        ? createdExtrinsics[phase.asApplyExtrinsic.toNumber()]?.id
                        : null;
                        
                    if (!await queryRunner.manager.getRepository(AcalaEvent).findOne({
                        where: { block: { id: blockRecord.id }, index }
                    })) {
                        const savedEvent = await queryRunner.manager.getRepository(AcalaEvent).save({
                            block: { id: blockRecord.id },
                            extrinsic: extrinsicId ? { id: extrinsicId } : undefined,
                            index,
                            section: event.section,
                            method: event.method,
                            data: event.data.toHuman(),
                            batchId
                        });

                        // Update extrinsic status based on events
                        if (extrinsicId && event.section === 'system') {
                            if (event.method === 'ExtrinsicSuccess') {
                                await queryRunner.manager.getRepository(AcalaExtrinsic).update(extrinsicId, {
                                    status: 'success'
                                });
                            } else if (event.method === 'ExtrinsicFailed') {
                                await queryRunner.manager.getRepository(AcalaExtrinsic).update(extrinsicId, {
                                    status: 'failed'
                                });
                            }
                        }
                    }
                }));
            }
            
            // Commit the database transaction
            await queryRunner.commitTransaction();
            // Return the processed block information
            return {
                number: block.number,
                hash: block.hash,
                batchId,
                timestamp: new Date()
            };
        } catch (e) {
            // Rollback the database transaction in case of an error
            await queryRunner.rollbackTransaction();
            console.error(`Error processing block ${block.number}:`, e);
            throw e;
        } finally {
            // Release the query runner
            await queryRunner.release();
        }
    } catch (e) {
        console.error(`Error processing block ${block.number}:`, e);
        // Return an object indicating failure and containing error details
        return { success: false, blockNumber: block.number, error: e };
    }
}
