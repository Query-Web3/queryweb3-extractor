import { DataSource } from 'typeorm';
import { Block } from '../../entities/Block';
import { Extrinsic } from '../../entities/Extrinsic';
import { Event } from '../../entities/Event';
import { ApiPromise } from '@polkadot/api';
import { initializeDataSource } from './dataSource';

/**
 * Processes a single block, extracting extrinsics and events
 * @param block - Block data to process
 * @param workerId - Worker ID for progress tracking
 * @param api - Polkadot API instance
 * @param batchId - Unique batch ID for tracking
 */
export async function processBlock(
    block: {
        number: number;
        hash: string;
        hashObj: any;
    },
    workerId: number,
    api: ApiPromise,
    batchId: string
) {
    try {
        if (!api) throw new Error('API not initialized');
        
        // Get the full block data
        const signedBlock = await api.rpc.chain.getBlock(block.hashObj);
        // Get the system events for the current block
        const events = await api.query.system.events.at(block.hashObj);

        // Process each extrinsic in the block to extract relevant information
        const extrinsics = await Promise.all(signedBlock.block.extrinsics.map(async (ext: any, index: number) => {
            let fee = '0';
            try {
                // Get the payment information for the extrinsic to calculate the fee
                if (ext && ext.isSigned && ext.signer && ext.method && api && api.isConnected) {
                    console.log(`Getting payment info for extrinsic ${index} with signer ${ext.signer.toString()}`);
                    try {
                        // Validate extrinsic method exists
                        if (!api.tx[ext.method.section]?.[ext.method.method]) {
                            console.warn(`Extrinsic method ${ext.method.section}.${ext.method.method} not found in API`);
                            fee = '0';
                        } else {
                            const tx = api.tx(ext.method);
                            if (!tx || !tx.isSigned) {
                                throw new Error('Invalid or unsigned transaction');
                            }
                            // Add timeout for payment info call
                            const paymentInfo = await Promise.race<{
                                partialFee: { toString: () => string };
                                toHuman: () => Record<string, any>;
                            }>([
                                tx.paymentInfo(ext.signer),
                                new Promise((_, reject) =>
                                    setTimeout(() => reject(new Error('Payment info timeout')), 5000)
                                )
                            ]);
                            if (!paymentInfo || !paymentInfo.partialFee) {
                                throw new Error('Invalid payment info response');
                            }
                            fee = paymentInfo.partialFee.toString();
                            console.log(`Payment info for extrinsic ${index}: ${JSON.stringify(paymentInfo.toHuman())}`);
                        }
                    } catch (e) {
                        console.error(`Failed to get payment info for extrinsic ${index}:`, e);
                        fee = '0';
                    }
                } else {
                    if (!ext.signer) {
                        console.log(`Skipping payment info for unsigned extrinsic ${index}`);
                    } else if (!api || !api.isConnected) {
                        console.error('API connection not available for payment info');
                    }
                    fee = '0';
                }
            } catch (e) {
                console.error(`Failed to get payment info for extrinsic ${index}:`, e);
                fee = '0';
            }
            
            return {
                index: index,
                method: ext.method.toString(),
                signer: ext.signer ? ext.signer.toString() : null,
                fee,
                status: 'pending',
                params: ext.method.toHuman()
            };
        }));

        // Use transaction to save block data
        const dataSource = await initializeDataSource();
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        
        try {
            // Create a block record in the database
            const blockRecord = await queryRunner.manager.getRepository(Block).save({
                number: block.number,
                hash: block.hash,
                batchId
            });
            
            if (extrinsics.length > 0) {
                // Create records for each extrinsic in the database
                const createdExtrinsics = await Promise.all(extrinsics.map(async ext => {
                    // Check if extrinsic already exists
                    const existingExtrinsic = await queryRunner.manager.getRepository(Extrinsic).findOne({
                        where: {
                            blockId: blockRecord.id,
                            index: ext.index
                        }
                    });
                    
                    if (!existingExtrinsic) {
                        return await queryRunner.manager.getRepository(Extrinsic).save({
                            blockId: blockRecord.id,
                            index: ext.index,
                            method: ext.method,
                            signer: ext.signer,
                            fee: ext.fee,
                            status: ext.status,
                            params: ext.params,
                            batchId
                        });
                    }
                    return existingExtrinsic;
                }).filter(Boolean));
                
                // Create records for each event in the database
                await Promise.all((events as any).map(async (record: any, index: number) => {
                    const { event, phase } = record;
                    // Determine the associated extrinsic ID based on the event phase
                    const extrinsicId = phase.isApplyExtrinsic
                        ? createdExtrinsics[phase.asApplyExtrinsic.toNumber()]?.id
                        : null;
                        
                    // Check if event already exists
                    const existingEvent = await queryRunner.manager.getRepository(Event).findOne({
                        where: {
                            block: { id: blockRecord.id },
                            index: index
                        }
                    });
                
                    if (!existingEvent) {
                        return await queryRunner.manager.getRepository(Event).save({
                            block: { id: blockRecord.id },
                            extrinsic: extrinsicId ? { id: extrinsicId } : undefined,
                            index,
                            section: event.section,
                            method: event.method,
                            data: event.data.toHuman(),
                            batchId
                        });
                    }
                    return null;
                }));
            }
            
            // Commit transaction
            await queryRunner.commitTransaction();
            return { success: true, blockNumber: block.number };
        } catch (e) {
            // Rollback transaction
            await queryRunner.rollbackTransaction();
            console.error(`Error processing block ${block.number}:`, e);
            return { success: false, blockNumber: block.number, error: e };
        } finally {
            // Release queryRunner
            await queryRunner.release();
        }
    } catch (e) {
        console.error(`Error processing block ${block.number}:`, e);
        return { success: false, blockNumber: block.number, error: e };
    }
}
