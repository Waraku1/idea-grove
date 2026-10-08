import {neon} from '@neondatabase/serverless';
import type {GroveDatabase, GroveStatement, WorldWrite} from '../../lib/database.ts';

type Rows = Record<string, unknown>[];
export type QueryExecutor = (query: string, values: unknown[]) => Promise<Rows>;
export function validateDatabaseURL(value: string | undefined): string {
  try {
    const u = new URL(value ?? '');
    if (!['postgres:', 'postgresql:'].includes(u.protocol) || !u.username || !u.password || !u.hostname.endsWith('.neon.tech') || (u.port && u.port !== '5432') || !/^\/[a-zA-Z0-9_-]+$/.test(u.pathname) || !['require', 'verify-full'].includes(u.searchParams.get('sslmode') ?? '') || u.hash) throw new Error();
    return value!;
  } catch {throw new Error('DATABASE_URL must be a private Neon PostgreSQL connection with TLS required.');}
}

export function createNeonDatabase(connectionString: string, execute?: QueryExecutor): GroveDatabase {
  validateDatabaseURL(connectionString);
  if (!execute) {
    const sql = neon(connectionString);
    execute = async (query, values) => await sql.query(query, values, {fetchOptions: {signal: AbortSignal.timeout(15000)}}) as Rows;
  }
  const run = execute;
  class Statement implements GroveStatement {
    readonly query: string;
    readonly values: unknown[];
    constructor(query: string, values: unknown[] = []) {this.query = query; this.values = values;}
    bind(...values: unknown[]) {return new Statement(this.query, values);}
    async all<T>() {
      let index = 0;
      const query = this.query.replace(/\?/g, () => '$' + ++index);
      if (index !== this.values.length) throw new Error('Invalid parameter count.');
      return {results: await run(query, this.values) as T[]};
    }
    async first<T>() {return (await this.all<T>()).results[0] ?? null;}
  }
  return {
    prepare: query => new Statement(query),
    async batch() {throw new Error('Use the atomic PostgreSQL save and erase operations.');},
    async saveWorld(write: WorldWrite) {
      await run('SELECT grove_save($1, $2, $3, $4, $5, $6)', [write.owner, write.revision, write.world, write.events, write.at, write.label]);
    },
    async eraseWorld(owner, at) {await run('SELECT grove_erase($1, $2)', [owner, at]);},
  };
}
