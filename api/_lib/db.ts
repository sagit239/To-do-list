import pg from 'pg';

// Return `date` columns as plain YYYY-MM-DD strings, never as JS Date (avoids time-zone shifts).
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (value) => value);

let pool: pg.Pool | undefined;

/**
 * One small pool per function instance, reused across invocations.
 * Connects through the Supabase Transaction Pooler (ARCHITECTURE 2.9).
 * Transactions must use a single client from pool.connect(), never separate pool.query calls.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not configured');
    }
    pool = new pg.Pool({
      connectionString,
      max: 1,
      // ADR-3: encrypted, without CA chain verification.
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      query_timeout: 8_000,
      statement_timeout: 8_000,
    });
  }
  return pool;
}
