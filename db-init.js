import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { pool } from './db.js';

const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');

try {
  await pool.query(schema);
  console.log('Schema applied');
} catch (err) {
  console.error('Failed to apply schema:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
