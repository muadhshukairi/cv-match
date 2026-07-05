// /api/stats.js — Seerah AI
// Reads and increments counters stored in Upstash Redis.
// GET  /api/stats          → returns all counters
// POST /api/stats?key=cvs  → increments a counter by 1

module.exports = async function handler(req, res) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    res.status(500).json({ error: 'Upstash not configured' });
    return;
  }

  async function redis(command) {
    const r = await fetch(`${url}/${command.join('/')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return r.json();
  }

  if (req.method === 'POST') {
    const key = req.query.key;
    if (!key) { res.status(400).json({ error: 'key required' }); return; }
    await redis(['INCR', `seerah:${key}`]);
    res.status(200).json({ ok: true });
    return;
  }

  // GET — return all counters
  const [cvs, searches, improved] = await Promise.all([
    redis(['GET', 'seerah:cvs']),
    redis(['GET', 'seerah:searches']),
    redis(['GET', 'seerah:improved']),
  ]);

  res.status(200).json({
    cvs:      parseInt(cvs.result      || 0),
    searches: parseInt(searches.result || 0),
    improved: parseInt(improved.result || 0),
  });
};
