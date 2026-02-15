import { Pool } from "pg";

export interface DatabaseConfig {
  readonly databaseUrl: string;
}

export class DatabaseClient {
  readonly pool: Pool;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({ connectionString: config.databaseUrl });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
