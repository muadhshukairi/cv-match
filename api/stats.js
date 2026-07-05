// /api/stats.js — Seerah AI
// Always returns JSON. Uses Upstash Redis REST API.

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    res.status(200).json({ cvs:0, searches:0, improved:0, error:'Upstash not configured' });
    return;
  }

  async function redisGet(key) {
    try {
      const r = await fetch(`${url}/GET/${key}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      return parseInt(d.result || 0);
    } catch(e) {
      return 0;
    }
  }

  async function redisIncr(key) {
    try {
      await fetch(`${url}/INCR/${key}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch(e) {}
  }

  try {
    if (req.method === 'POST') {
      const key = req.query.key;
      if (key) await redisIncr(`seerah_${key}`);
      res.status(200).json({ ok: true });
      return;
    }

    // GET — return all counters
    const [cvs, searches, improved] = await Promise.all([
      redisGet('seerah_cvs'),
      redisGet('seerah_searches'),
      redisGet('seerah_improved'),
    ]);

    res.status(200).json({ cvs, searches, improved });

  } catch(e) {
    res.status(200).json({ cvs:0, searches:0, improved:0, error: e.message });
  }
};
