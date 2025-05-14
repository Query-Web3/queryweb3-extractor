import { Command } from 'commander';
import { extractDataSource } from '../../datasources/extractDataSource';

export async function truncateTables(schema: string) {
    try {
        await extractDataSource.initialize();
        const queryRunner = extractDataSource.createQueryRunner();
        
        await queryRunner.connect();
        const schemas = schema.split(',').map((s: string) => s.trim());
        const conditions = schemas.map((s: string) => `table_name LIKE '${s}_%'`).join(' OR ');
        
        const tables = await queryRunner.query(
            `SELECT table_name 
             FROM information_schema.tables 
             WHERE ${conditions}`
        );

        if (tables.length === 0) {
            console.log(`No tables found with prefixes: ${schemas.join(', ')}`);
            return;
        }

        console.log(`Truncating ${tables.length} tables with prefixes: ${schemas.join(', ')}`);
        for (const table of tables) {
            await queryRunner.query(`TRUNCATE TABLE ${table.table_name}`);
            console.log(`Truncated table: ${table.table_name}`);
        }
        
        console.log('Truncate operation completed successfully');
    } catch (err) {
        console.error('Error truncating tables:', err);
        throw err;
    } finally {
        if (extractDataSource.isInitialized) {
            await extractDataSource.destroy();
        }
    }
}

export function registerTruncateCommand(program: Command) {
    program.command('truncate')
        .description('Truncate tables with specified schema prefix')
        .option('-s, --schema <string>', 'Schema prefix for tables to truncate', 'acala')
        .action(async (options) => {
            try {
                await truncateTables(options.schema);
                process.exit(0);
            } catch (err) {
                process.exit(1);
            }
        });
}
