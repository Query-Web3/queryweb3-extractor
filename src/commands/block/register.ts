import { Command } from 'commander';
import { extractDataSource } from '../../datasources/extractDataSource';
import { getBlockDetails } from './main';

export function registerBlockCommand(program: Command) {
    program.command('block')
        .description('Show current blockchain details')
        .option('-t, --time-range <string>', 'Time range (e.g. 2h, 3d, 1w, 1m, 1y)')
        .action((options) => {
            (async () => {
                try {
                    await extractDataSource.initialize();
                    const details = await getBlockDetails(options.timeRange);
                    console.log('Blockchain Details:');
                    
                    if ('firstBlock' in details) {
                        console.log('Block Range Query Results:');
                        console.log(`Time Range: ${details.timeRange}`);
                        console.log(`First Block: ${details.firstBlock.number}`);
                        console.log(`Latest Block: ${details.latestBlock}`);
                        console.log(`Block Difference: ${details.blockDiff}`);
                        console.log(`First Block Timestamp: ${details.firstBlock.timestamp}`);
                    } else {
                        console.log('Current Block:', details.currentBlock);
                        console.log('Chain Stats:', details.chainStats);
                    }
                } catch (err) {
                    console.error('Error getting block details:', err);
                } finally {
                    if (extractDataSource.isInitialized) {
                        await extractDataSource.destroy();
                    }
                    process.exit(0);
                }
            })();
        });
}
