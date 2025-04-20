import { PrismaClient, BatchStatus } from '@prisma/client';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { options } from '@acala-network/api';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();
const INTERVAL_MS = process.env.INTERVAL_MS ? Number(process.env.INTERVAL_MS) : 3600000;

export async function extractData(batchLog?: {id: number}) {
    const batchId = uuidv4();
    console.log(`Starting batch with ID: ${batchId}`);
    
    const wsProvider = new WsProvider('wss://acala-rpc.aca-api.network');
    const provider = new WsProvider('wss://karura.api.onfinality.io/public-ws');
    const api = new ApiPromise(options({ provider }));
    await api.isReady;
    
    const header = await api.rpc.chain.getHeader();
    console.log(`Connected to Acala network - Block Number: ${header.number}, Block Hash: ${header.hash}`);
    
    const signedBlock = await api.rpc.chain.getBlock(header.hash);
    const events = await api.query.system.events.at(header.hash);
    
    const extrinsics = await Promise.all(signedBlock.block.extrinsics.map(async (ext: any, index: number) => {
        let fee = '0';
        try {
            const paymentInfo = await api.tx(ext.method).paymentInfo(ext.signer);
            fee = paymentInfo.partialFee.toString();
        } catch (e) {}
        
        return {
            index: index,
            method: ext.method.toString(),
            signer: ext.signer ? ext.signer.toString() : null,
            fee,
            status: 'pending',
            params: ext.method.toHuman()
        };
    }));
    
    const blockRecord = await prisma.block.create({
        data: {
            number: header.number.toNumber(),
            hash: header.hash.toString(),
            batchId
        }
    });
    
    if (extrinsics.length > 0) {
        const createdExtrinsics = await Promise.all(extrinsics.map(async ext => {
            return await prisma.extrinsic.create({
                data: {
                    blockId: blockRecord.id,
                    index: ext.index,
                    method: ext.method,
                    signer: ext.signer,
                    fee: ext.fee,
                    status: ext.status,
                    params: ext.params,
                    batchId
                }
            });
        }));
        
        await Promise.all((events as any).map(async (record: any, index: number) => {
            const { event, phase } = record;
            const extrinsicId = phase.isApplyExtrinsic
                ? createdExtrinsics[phase.asApplyExtrinsic.toNumber()]?.id
                : null;
                
            return await prisma.event.create({
                data: {
                    blockId: blockRecord.id,
                    extrinsicId,
                    index,
                    section: event.section,
                    method: event.method,
                    data: event.data.toHuman(),
                    batchId
                }
            });
        }));
    }
    
    await api.disconnect();
    
    if (batchLog) {
        await prisma.batchLog.update({
            where: { id: batchLog.id },
            data: {
                endTime: new Date(),
                status: BatchStatus.SUCCESS
            }
        });
    }
}

export async function runExtract() {
    while (true) {
        let batchLog;
        try {
            batchLog = await prisma.batchLog.create({
                data: {
                    batchId: uuidv4(),
                    status: BatchStatus.RUNNING
                }
            });
            
            await extractData(batchLog);
        } catch (e) {
            console.error(e);
            
            if (batchLog) {
                await prisma.batchLog.update({
                    where: { id: batchLog.id },
                    data: {
                        endTime: new Date(),
                        status: BatchStatus.FAILED,
                        retryCount: { increment: 1 }
                    }
                });
            }
        }
        console.log(`Wait for <${INTERVAL_MS / 3600000}> hours to run next batch...`);
        await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
    }
}