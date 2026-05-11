import "server-only";

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

type MigrationStatus =
  | { ok: true; applied: string[]; skipped: boolean }
  | { ok: false; error: string };

let ensurePromise: Promise<MigrationStatus> | null = null;

function isMissingEnvError(err: unknown): boolean {
  return err instanceof Error && /connection string|password|database url/i.test(err.message);
}

async function resolveDatabaseUrl(): Promise<string> {
  const fromEnv =
    process.env.SUPABASE_DB_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_PRISMA_URL;
  if (fromEnv) return fromEnv;

  const password =
    process.env.SUPABASE_DB_PASSWORD ??
    process.env.POSTGRES_PASSWORD ??
    process.env.DB_PASSWORD;
  if (!password) {
    throw new Error("Missing database url/password for runtime migrations.");
  }

  const poolerPath = path.join(process.cwd(), "supabase", ".temp", "pooler-url");
  const rawPooler = (await readFile(poolerPath, "utf8")).trim();
  if (!rawPooler) {
    throw new Error("Missing Supabase pooler url for runtime migrations.");
  }

  const url = new URL(rawPooler);
  url.password = password;
  return url.toString();
}

async function ensureLedger(client: Client) {
  await client.query(`
    create table if not exists public.app_runtime_migrations (
      filename text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function readMigrationFiles(): Promise<Array<{ filename: string; sql: string; checksum: string }>> {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const filenames = (await readdir(dir))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  return Promise.all(
    filenames.map(async (filename) => {
      const sql = await readFile(path.join(dir, filename), "utf8");
      return {
        filename,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

async function runMigrations(): Promise<MigrationStatus> {
  let dbUrl: string;
  try {
    dbUrl = await resolveDatabaseUrl();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not resolve database connection.",
    };
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();
    await client.query("select pg_advisory_lock(8723419512345)");
    await ensureLedger(client);

    const appliedRows = await client.query<{
      filename: string;
      checksum: string;
    }>("select filename, checksum from public.app_runtime_migrations");
    const applied = new Map(
      appliedRows.rows.map((row: { filename: string; checksum: string }) => [
        row.filename,
        row.checksum,
      ]),
    );

    const migrations = await readMigrationFiles();
    const newlyApplied: string[] = [];

    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.filename);
      if (existingChecksum === migration.checksum) continue;
      if (existingChecksum && existingChecksum !== migration.checksum) {
        return {
          ok: false,
          error:
            `Runtime migration checksum mismatch for ${migration.filename}. ` +
            "Change the migration filename instead of editing an applied file.",
        };
      }

      await client.query(migration.sql);
      await client.query(
        `
          insert into public.app_runtime_migrations (filename, checksum)
          values ($1, $2)
          on conflict (filename)
          do update set checksum = excluded.checksum, applied_at = now()
        `,
        [migration.filename, migration.checksum],
      );
      newlyApplied.push(migration.filename);
    }

    return { ok: true, applied: newlyApplied, skipped: newlyApplied.length === 0 };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Runtime migration failed.",
    };
  } finally {
    try {
      await client.query("select pg_advisory_unlock(8723419512345)");
    } catch {
      // ignore unlock failures on broken connections
    }
    await client.end().catch(() => {});
  }
}

export async function ensureSupabaseRuntimeMigrations(): Promise<MigrationStatus> {
  if (!ensurePromise) {
    ensurePromise = runMigrations();
  }
  const result = await ensurePromise;
  if (!result.ok && isMissingEnvError(new Error(result.error))) {
    console.warn("[supabase] runtime migrations skipped:", result.error);
  } else if (!result.ok) {
    console.error("[supabase] runtime migrations failed:", result.error);
  } else if (!result.skipped) {
    console.info("[supabase] runtime migrations applied:", result.applied.join(", "));
  }
  return result;
}
