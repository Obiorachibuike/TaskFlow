/**
 * Embedded PostgreSQL helper for local development and CI.
 *
 * Bootstraps a real PostgreSQL server (binaries shipped via npm) under
 * `.data/postgres` and manages its lifecycle:
 *
 *   npm run db:embedded -- init     # create the data directory + databases
 *   npm run db:embedded -- start    # start and keep running (foreground)
 *   npm run db:embedded -- stop     # stop the server
 *   npm run db:embedded -- status   # print status
 *
 * For production, use any managed PostgreSQL and set DATABASE_URL instead.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), ".data", "postgres");
const STATE_FILE = join(process.cwd(), ".data", "embedded-pg.json");
const PORT = Number(process.env.EMBEDDED_PG_PORT ?? 55432);
const USER = "taskflow";
const PASSWORD = "taskflow";

function makeInstance() {
  return new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
    onLog: () => {},
  });
}

async function init() {
  if (existsSync(STATE_FILE)) {
    console.log("Embedded Postgres already initialised.");
    return;
  }
  mkdirSync(join(process.cwd(), ".data"), { recursive: true });
  const pg = makeInstance();
  await pg.initialise();
  await pg.start();
  for (const db of ["taskflow", "taskflow_test"]) {
    try {
      await pg.createDatabase(db);
      console.log(`Created database ${db}`);
    } catch {
      /* already exists */
    }
  }
  await pg.stop();
  writeFileSync(
    STATE_FILE,
    JSON.stringify({ port: PORT, user: USER, password: PASSWORD }, null, 2),
  );
  console.log(`Embedded Postgres initialised on port ${PORT}.`);
}

async function start() {
  if (!existsSync(STATE_FILE)) await init();
  const pg = makeInstance();
  await pg.start();
  console.log(`Embedded Postgres running on port ${PORT} (Ctrl+C to stop).`);
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  // keep process alive
  setInterval(() => {}, 1 << 30);
}

async function stop() {
  if (!existsSync(STATE_FILE)) {
    console.log("Not initialised.");
    return;
  }
  const pg = makeInstance();
  await pg.stop();
  console.log("Stopped.");
}

async function status() {
  if (!existsSync(STATE_FILE)) {
    console.log("Not initialised. Run: npm run db:embedded -- init");
    return;
  }
  console.log(readFileSync(STATE_FILE, "utf8"));
  console.log(`Data dir: ${DATA_DIR}`);
}

const cmd = process.argv[2] ?? "start";
const actions: Record<string, () => Promise<void>> = { init, start, stop, status };
const action = actions[cmd];
if (!action) {
  console.error(`Unknown command: ${cmd}. Use init|start|stop|status`);
  process.exit(1);
}
action().catch((err) => {
  console.error(err);
  process.exit(1);
});
