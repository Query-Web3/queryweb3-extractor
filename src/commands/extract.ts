import { PrismaClient, BatchStatus } from '@prisma/client';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { options } from '@acala-network/api';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();
const INTERVAL_MS = process.env.INTERVAL_MS ? Number(process.env.INTERVAL_MS) : 3600000;

/**
 * Extracts data from the Acala network, including blocks, extrinsics, and events,
 * and stores them in the database. Updates the batch log status upon completion.
 * 
 * @param batchLog - Optional object containing the batch log ID. Used to update the batch status.
 */
export async function extractData(batchLog?: {id: number}) {
    // Generate a unique ID for the current data extraction batch
    const batchId = uuidv4();
    console.log(`Starting batch with ID: ${batchId}`);
    
    // Create a WebSocket provider for the Acala network (Note: this provider is declared but not used)
    const wsProvider = new WsProvider('wss://acala-rpc.aca-api.network');
    // Create a WebSocket provider for the Karura network
    const provider = new WsProvider('wss://karura.api.onfinality.io/public-ws');
    // Initialize an API promise with the specified provider
    const api = new ApiPromise(options({ provider }));
    // Wait for the API to be ready
    await api.isReady;
    
    // Get the latest block header from the network
    const header = await api.rpc.chain.getHeader();
    console.log(`Connected to Acala network - Block Number: ${header.number}, Block Hash: ${header.hash}`);
    
    // Get the full block data using the block hash from the header
    const signedBlock = await api.rpc.chain.getBlock(header.hash);
    // Get the system events at the specified block hash (Note: 'at' method is deprecated)
    const events = await api.query.system.events.at(header.hash);
    
    // Process each extrinsic in the block to extract relevant information
    const extrinsics = await Promise.all(signedBlock.block.extrinsics.map(async (ext: any, index: number) => {
        let fee = '0';
        try {
            // Get the payment information for the extrinsic to calculate the fee
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
    
    // Create a block record in the database
    const blockRecord = await prisma.block.create({
        data: {
            number: header.number.toNumber(),
            hash: header.hash.toString(),
            batchId
        }
    });
    
    if (extrinsics.length > 0) {
        // Create records for each extrinsic in the database
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
        
        // Create records for each event in the database
        await Promise.all((events as any).map(async (record: any, index: number) => {
            const { event, phase } = record;
            // Determine the associated extrinsic ID based on the event phase
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
    
    // Disconnect from the network API
    await api.disconnect();
    
    if (batchLog) {
        // Update the batch log status to success and set the end time
        await prisma.batchLog.update({
            where: { id: batchLog.id },
            data: {
                endTime: new Date(),
                status: BatchStatus.SUCCESS
            }
        });
    }
}

/**
 * Continuously runs the data extraction process at specified intervals.
 * Creates a new batch log for each extraction attempt, updates its status upon success or failure,
 * and retries the extraction if it fails.
 */
export async function runExtract() {
    // Infinite loop to ensure the extraction process runs continuously
    while (true) {
        // Variable to hold the batch log record created for each extraction attempt
        let batchLog;
        try {
            // Create a new batch log record in the database with a unique batch ID and set its status to RUNNING
            batchLog = await prisma.batchLog.create({
                data: {
                    batchId: uuidv4(),
                    status: BatchStatus.RUNNING
                }
            });
            
            // Call the extractData function with the created batch log to start the data extraction process
            await extractData(batchLog);
        } catch (e) {
            // Log any errors that occur during the extraction process
            console.error(e);
            
            // Check if a batch log was successfully created before attempting to update it
            if (batchLog) {
                // Update the batch log status to FAILED, set the end time, and increment the retry count
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
        // Log the time to wait before starting the next extraction batch
        console.log(`Wait for <${INTERVAL_MS / 3600000}> hours to run next batch...`);
        // Pause the execution for the specified interval before starting the next extraction batch
        await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
    }
}