import dotenv from 'dotenv';
dotenv.config();
import { Command } from 'commander';
import { runExtract } from './commands/extract';
import { transformData } from './commands/transform';
import { extractDataSource } from './datasources/extractDataSource';
import { transformDataSource } from './datasources/transformDataSource';

const program = new Command();

program
    .name('acala-data-extractor')
    .description('CLI for extracting and transforming Acala blockchain data')
    .version('0.2.0');

program.command('extract')
    .description('Extract raw data from Acala blockchain')
    .action(async () => {
        try {
            await runExtract();
        } finally {
            if (extractDataSource.isInitialized) {
                await extractDataSource.destroy();
            }
        }
    });

program.command('transform')
    .description('Transform extracted Acala data to DIM tables')
    .action(async () => {
        try {
            await transformData();
        } finally {
            if (transformDataSource.isInitialized) {
                await transformDataSource.destroy();
            }
        }
    });

program.parseAsync(process.argv).catch(async (err: Error) => {
    console.error(err);
    if (extractDataSource.isInitialized) await extractDataSource.destroy();
    if (transformDataSource.isInitialized) await transformDataSource.destroy();
    process.exit(1);
});
