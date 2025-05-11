import { DataSource } from 'typeorm';
import { Block } from '../../entities/Block';
import { Extrinsic } from '../../entities/Extrinsic';
import { Event } from '../../entities/Event';
import { ApiPromise } from '@polkadot/api';
import { initializeDataSource } from './dataSource';

interface PaymentInfo {
    partialFee: {
        toString: () => string;
    };
    toHuman: () => Record<string, any>;
}

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
        
        const signedBlock = await api.rpc.chain.getBlock(block.hashObj);
        const events = await api.query.system.events.at(block.hashObj);

        const extrinsics = await Promise.all(signedBlock.block.extrinsics.map(async (ext: any, index: number) => {
            let fee = '0';
            try {
                if (ext && ext.isSigned && ext.signer && ext.method && api && api.isConnected) {
                    console.log(`Getting payment info for extrinsic ${index} with signer ${ext.signer.toString()}`);
                    
                    if (!api.tx[ext.method.section]?.[ext.method.method]) {
                        console.warn(`Extrinsic method ${ext.method.section}.${ext.method.method} not found in API`);
                        fee = '0';
                    } else {
                        const tx = api.tx(ext.method);
                        if (!tx || !tx.isSigned) {
                            console.log(`Skipping payment info for unsigned extrinsic ${index}`);
                            fee = '0';
                        } else {
                            try {
                                const paymentInfo = await Promise.race<PaymentInfo>([
                                    tx.paymentInfo(ext.signer),
                                    new Promise<PaymentInfo>((_, reject) => 
                                        setTimeout(() => reject(new Error('Payment info timeout')), 5000)
                                )]);
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
                    console.log(`Skipping payment info for unsigned extrinsic ${index}`);
                }
            } catch (e) {
                console.error(`Failed to process extrinsic ${index}:`, e);
            }
            
            return {
                index,
                method: `${ext.method.section}.${ext.method.method}`,
                signer: ext.signer?.toString() || null,
                fee,
                status: 'pending',
                params: ext.method.toHuman()
            };
        }));

        const dataSource = await initializeDataSource();
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        
        try {
            const blockRecord = await queryRunner.manager.getRepository(Block).save({
                number: block.number,
                hash: block.hash,
                batchId
            });
            
            if (extrinsics.length > 0) {
                const createdExtrinsics = await Promise.all(extrinsics.map(async ext => {
                    const existing = await queryRunner.manager.getRepository(Extrinsic).findOne({
                        where: { blockId: blockRecord.id, index: ext.index }
                    });
                    return existing || await queryRunner.manager.getRepository(Extrinsic).save({
                        blockId: blockRecord.id,
                        ...ext,
                        batchId
                    });
                }));

                await Promise.all((events as unknown as any[]).map(async (record: any, index: number) => {
                    const { event, phase } = record;
                    const extrinsicId = phase.isApplyExtrinsic
                        ? createdExtrinsics[phase.asApplyExtrinsic.toNumber()]?.id
                        : null;
                        
                    if (!await queryRunner.manager.getRepository(Event).findOne({
                        where: { block: { id: blockRecord.id }, index }
                    })) {
                        await queryRunner.manager.getRepository(Event).save({
                            block: { id: blockRecord.id },
                            extrinsic: extrinsicId ? { id: extrinsicId } : undefined,
                            index,
                            section: event.section,
                            method: event.method,
                            data: event.data.toHuman(),
                            batchId
                        });
                    }
                }));
            }
            
            await queryRunner.commitTransaction();
            return {
                number: block.number,
                hash: block.hash,
                batchId,
                timestamp: new Date()
            };
        } catch (e) {
            await queryRunner.rollbackTransaction();
            console.error(`Error processing block ${block.number}:`, e);
            throw e;
        } finally {
            await queryRunner.release();
        }
    } catch (e) {
        console.error(`Error processing block ${block.number}:`, e);
        return { success: false, blockNumber: block.number, error: e };
    }
}
