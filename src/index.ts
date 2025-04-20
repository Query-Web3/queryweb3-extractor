import dotenv from 'dotenv';
dotenv.config();
import { Command } from 'commander';
import { runExtract } from './commands/extract';
import { transformData } from './commands/transform';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const program = new Command();

program
    .name('acala-data-extractor')
    .description('CLI for extracting and transforming Acala blockchain data')
    .version('0.1.0');

program.command('extract')
    .description('Extract raw data from Acala blockchain')
    .action(async () => {
        await runExtract().finally(async () => {
            await prisma.$disconnect();
        });
    });

program.command('transform')
    .description('Transform extracted Acala data to DIM tables')
    .action(async () => {
        await transformData().finally(async () => {
            await prisma.$disconnect();
        });
    });

program.parseAsync(process.argv).catch(async (err: Error) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});