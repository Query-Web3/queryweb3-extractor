import dotenv from 'dotenv';
dotenv.config();
import { ApiPromise, WsProvider } from '@polkadot/api';
import { options } from '@acala-network/api';
import { PrismaClient, BatchStatus } from '@prisma/client';
import type { EventRecord } from '@polkadot/types/interfaces';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

const INTERVAL_MS = process.env.INTERVAL_MS ? Number(process.env.INTERVAL_MS) : 3600000;

async function processBlock(batchLog?: {id: number}) {
    const batchId = uuidv4();
    console.log(`Starting batch with ID: ${batchId}`);
    
    
    // 通过WebSocket连接Acala网络
    const wsProvider = new WsProvider('wss://acala-rpc.aca-api.network');
    const provider = new WsProvider('wss://karura.api.onfinality.io/public-ws');
    const api = new ApiPromise(options({ provider }));
    await api.isReady;
    
    // 获取最新区块头信息
    const header = await api.rpc.chain.getHeader();
    console.log(`Connected to Acala network - Block Number: ${header.number}, Block Hash: ${header.hash}`);
    
    // 获取块详情，包括extrinsics和events
    const signedBlock = await api.rpc.chain.getBlock(header.hash);
    const events = await api.query.system.events.at(header.hash);
    
    // 处理extrinsics数据
    const extrinsics = await Promise.all(signedBlock.block.extrinsics.map(async (ext: any, index: number) => {
        let fee = '0';
        try {
            // 尝试获取交易费用
            const paymentInfo = await api.tx(ext.method).paymentInfo(ext.signer);
            fee = paymentInfo.partialFee.toString();
        } catch (e) {
            // 静默处理错误，使用默认值0
        }
        
        return {
            index: index,
            method: ext.method.toString(),
            signer: ext.signer ? ext.signer.toString() : null,
            fee,
            status: 'pending', // 初始状态
            params: ext.method.toHuman()
        };
    }));
    
    // 将块数据保存到MySQL数据库中
    const blockRecord = await prisma.block.create({
      data: {
        number: header.number.toNumber(),
        hash: header.hash.toString(),
        batchId
      }
    });
    console.log('Block saved:', blockRecord);
    
    // 将extrinsics数据保存到MySQL数据库中
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
      console.log('Extrinsics saved:', createdExtrinsics.length);
      
      // 处理并保存事件数据
      const eventRecords = await Promise.all((events as any).map(async (record: any, index: number) => {
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
      console.log('Events saved:', eventRecords.length);
    }
    
    // 断开API连接
    await api.disconnect();
    
    // 更新batch日志状态为成功
    await prisma.batchLog.update({
      where: { id: batchLog!.id },
      data: {
        endTime: new Date(),
        status: BatchStatus.SUCCESS
      }
    });
}

async function run() {
    while (true) {
        let batchLog;
        try {
            // 创建batch日志记录
            batchLog = await prisma.batchLog.create({
              data: {
                batchId: uuidv4(),
                status: BatchStatus.RUNNING
              }
            });
            
            await processBlock(batchLog!);
        } catch (e) {
            console.error(e);
            
            // 更新batch日志状态为失败并增加重试次数
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

run().finally(async () => {
    await prisma.$disconnect();
});