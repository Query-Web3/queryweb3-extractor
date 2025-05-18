import { DataSource } from 'typeorm';
import * as readline from 'readline';
import { createInterface } from 'readline';

interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export async function getDatabaseConfig(): Promise<DatabaseConfig> {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USERNAME || '',
    password: process.env.DB_PASSWORD || ''
  };
}

export async function promptForAdminCredentials(): Promise<{username: string, password: string}> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Enter database admin username: ', (username) => {
      rl.question('Enter password: ', (password) => {
        rl.close();
        resolve({username, password});
      });
    });
  });
}

export async function createDatabase(datasource: DataSource, dbName: string) {
  const queryRunner = datasource.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
    console.log(`Database ${dbName} created successfully`);
  } catch (err) {
    console.error(`Failed to create database ${dbName}:`, err);
    throw err;
  } finally {
    await queryRunner.release();
  }
}

export async function executeSqlFile(datasource: DataSource, dbName: string, sql: string) {
  const queryRunner = datasource.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.query(`USE ${dbName}`);
    const statements = sql.split(';').filter(s => s.trim().length > 0);
    for (const statement of statements) {
      try {
        await queryRunner.query(statement);
      } catch (err) {
        console.error(`Failed to execute SQL: ${statement}`, err);
      }
    }
    console.log(`Database ${dbName} tables created successfully`);
  } catch (err) {
    console.error(`Failed to execute SQL file:`, err);
    throw err;
  } finally {
    await queryRunner.release();
  }
}
