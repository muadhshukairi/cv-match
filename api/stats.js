// /api/stats.js — Seerah AI
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    res.status(200).json({ cvs:0, searches:0, improved:0, error:'Upstash env vars missing' });
    return;
  }

  async function redisCmd(cmd, key) {
    try {
      const r = await fetch(`${url}/${cmd}/${encodeURIComponent(key)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await r.text();
      console.log(`Redis ${cmd} ${key} → ${r.status}: ${text}`);
      const d = JSON.parse(text);
      return d.result;
    } catch(e) {
      console.log(`Redis error ${cmd} ${key}: ${e.message}`);
      return null;
    }
  }

  try {
    if (req.method === 'POST') {
      const key = req.query.key;
      if (!key) { res.status(400).json({ error:'key required' }); return; }
      const result = await redisCmd('INCR', `seerah_${key}`);
      res.status(200).json({ ok: true, new_value: result });
      return;
    }

    // GET — read all counters
    const [cvs, searches, improved] = await Promise.all([
      redisCmd('GET', 'seerah_cvs'),
      redisCmd('GET', 'seerah_searches'),
      redisCmd('GET', 'seerah_improved'),
    ]);

    res.status(200).json({
      cvs:      parseInt(cvs      || 0),
      searches: parseInt(searches || 0),
      improved: parseInt(improved || 0),
      upstash_connected: true,
    });

  } catch(e) {
    res.status(200).json({ cvs:0, searches:0, improved:0, error: e.message });
  }
};
