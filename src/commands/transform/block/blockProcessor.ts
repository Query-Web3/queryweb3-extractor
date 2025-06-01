import { DataSource } from 'typeorm';
import { Not, IsNull } from 'typeorm';
import { AcalaBlock } from '../../../entities/acala/AcalaBlock';
import { AcalaExtrinsic } from '../../../entities/acala/AcalaExtrinsic';
import { AcalaEvent } from '../../../entities/acala/AcalaEvent';
import { Logger } from '../../../utils/logger';

export class BlockProcessor {
    constructor(
        private dataSource: DataSource,
        private logger: Logger
    ) {}

    async getLatestBlock() {
        const blockTimer = this.logger.time('Query latest block');
        const blockRepo = this.dataSource.getRepository(AcalaBlock);
        this.logger.info('Querying latest block...');
        const latestBlock = await blockRepo.findOne({ 
            where: {},
            order: { number: 'DESC' }
        });
        
        if (!latestBlock) {
            throw new Error('No blocks found in acala_block table');
        }
        
        this.logger.info(`Processing latest block #${latestBlock.number} (batchId: ${latestBlock.batchId})`);
        blockTimer.end();
        return latestBlock;
    }

    async processAcalaBlocks(tokenIds: Set<string>) {
        const blockRepo = this.dataSource.getRepository(AcalaBlock);
        const acalaBlocks = await blockRepo.find({
            where: { acalaData: Not(IsNull()) },
            order: { number: 'ASC' }
        });

        if (acalaBlocks.length > 0) {
            const acalaTimer = this.logger.time('Process Acala block data');
            try {
                this.logger.info(`Found ${acalaBlocks.length} blocks with Acala data`);
                
                for (const block of acalaBlocks) {
                    try {
                        const acalaData = block.acalaData;
                        if (acalaData?.events) {
                            for (const event of acalaData.events) {
                                if (event?.currencyId) {
                                    tokenIds.add(event.currencyId);
                                }
                            }
                        }
                        this.logger.recordSuccess();
                    } catch (e) {
                        this.logger.error(`Failed to process Acala data for block #${block.number}`, e as Error);
                        this.logger.recordError();
                    }
                }
            } finally {
                acalaTimer.end();
            }
        }
    }

    async processExtrinsics(tokenIds: Set<string>) {
        const methodsToProcess = [
            'tokens.transfer',
            'dex.swapWithExactSupply',
            'dex.swapWithExactTarget',
            'homa.mint',
            'homa.requestRedeem'
        ];

        const processTimer = this.logger.time('Process extrinsics');
        try {
            const extrinsics = await this.dataSource.getRepository(AcalaExtrinsic)
                .createQueryBuilder('extrinsic')
                .where('extrinsic.method IN (:...methods)', { methods: methodsToProcess })
                .groupBy('extrinsic.params')
                .getMany();

            for (const extrinsic of extrinsics) {
                    try {
                        const method = extrinsic.method;
                        const params = extrinsic.params as any;
                        
                        if (method.startsWith('tokens.') && params?.currencyId) {
                            tokenIds.add(params.currencyId);
                        } else if (method.startsWith('dex.') && params?.path) {
                            for (const currencyId of params.path) {
                                tokenIds.add(currencyId);
                            }
                        } else if (method.startsWith('homa.')) {
                            tokenIds.add('ACA');
                        }
                        this.logger.recordSuccess();
                    } catch (e) {
                        this.logger.error(`Failed to process extrinsic`, e as Error, {
                            extrinsicId: extrinsic.id,
                            method: extrinsic.method,
                            params: extrinsic.params
                        });
                        this.logger.recordError();
                    }
            }
        } finally {
            processTimer.end();
        }
    }

    getBlockRepo() {
        return this.dataSource.getRepository(AcalaBlock);
    }

    async processEvents(tokenIds: Set<string>) {
        const eventPatterns = [
            { section: 'tokens', method: 'transfer' },
            { section: 'dex', method: 'swap' },
            { section: 'homa', method: 'minted' },
            { section: 'homa', method: 'redeemed' },
            { section: 'rewards', method: 'reward' }
        ];

        const eventTimer = this.logger.time('Process events');
        try {
            const events = await this.dataSource.getRepository(AcalaEvent)
                .createQueryBuilder('event')
                .where('LOWER(event.section) IN (:...sections) AND LOWER(event.method) IN (:...methods)', {
                    sections: eventPatterns.map(p => p.section.toLowerCase()),
                    methods: eventPatterns.map(p => p.method.toLowerCase())
                })
                .getMany();

            for (const event of events) {
                try {
                    const data = event.data as any;
                    if (data?.currencyId) {
                        tokenIds.add(data.currencyId);
                    }
                    this.logger.recordSuccess();
                } catch (e) {
                    this.logger.error(`Failed to process event`, e as Error, {
                        eventId: event.id,
                        section: event.section,
                        method: event.method,
                        data: event.data
                    });
                    this.logger.recordError();
                }
            }
        } finally {
            eventTimer.end();
        }
    }
}
