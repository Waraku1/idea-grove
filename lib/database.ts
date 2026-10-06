/** Persistence contract shared by Sites/D1 and the independent Node service. */
export interface GroveStatement {
  bind(...values: unknown[]): GroveStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{results: T[]}>;
}
export type WorldWrite = {owner: string; revision: number; world: string; events: string; at: string; label: string};
export interface GroveDatabase {
  prepare(query: string): GroveStatement;
  batch(statements: GroveStatement[]): Promise<unknown[]>;
  saveWorld?(write: WorldWrite): Promise<void>;
  eraseWorld?(owner: string, at: string): Promise<void>;
}
