// Optional: run the background worker outside Vercel (e.g. a Render cron job,
// a VPS crontab, or locally). On Vercel, the built-in cron calls /api/cron/tick instead.
//   node scripts/worker.js          -> run one tick and exit
//   node scripts/worker.js --loop   -> run every 5 minutes
try {
  process.loadEnvFile?.('.env');
} catch {
  /* no .env */
}

const { connectDb, disconnectDb } = await import('../server/config/db.js');
const { runTick } = await import('../server/jobs/tick.js');
const { ensureSourceConfigs } = await import('../server/services/scanner.js');

await connectDb();
await ensureSourceConfigs();

const once = async () => console.log(JSON.stringify({ t: new Date().toISOString(), tick: await runTick({ budgetMs: 240_000 }) }));

if (process.argv.includes('--loop')) {
  await once();
  setInterval(() => once().catch((e) => console.error('tick failed', e.message)), 5 * 60_000);
} else {
  await once();
  await disconnectDb();
}
