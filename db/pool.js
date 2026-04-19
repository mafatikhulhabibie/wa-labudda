import mysql from 'mysql2/promise';
import { getConfig } from '../config/index.js';

/** @type {import('mysql2/promise').Pool | null} */
let pool = null;

export function getPool() {
  if (pool) return pool;
  const { mysql: m } = getConfig();
  if (!m.host || !m.database) {
    throw new Error('MySQL is not configured: set MYSQL_HOST and MYSQL_DATABASE (and credentials).');
  }
  pool = mysql.createPool({
    host: m.host,
    port: m.port,
    user: m.user,
    password: m.password,
    database: m.database,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
  });
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
