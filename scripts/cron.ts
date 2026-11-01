// Development helper: calls the scheduled-jobs endpoint every 5 minutes.
const url = `${process.env.APP_URL ?? "http://localhost:3000"}/api/cron/tick`;
async function tick() {
  try {
    const r = await fetch(url, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    console.log(new Date().toISOString(), r.status, await r.text());
  } catch (e) { console.error(e); }
}
tick();
setInterval(tick, 5 * 60_000);
