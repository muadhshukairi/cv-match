// /api/track.js — Seerah AI
// Called from browser after each user action. Just increments a counter.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const event = req.query.event;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!event || !url || !token) {
    res.status(200).json({ ok: false });
    return;
  }

  const cleanUrl = url.replace(/\/+$/, '');
  try {
    const r = await fetch(`${cleanUrl}/INCR/seerah_${event}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    res.status(200).json({ ok: true, value: d.result });
  } catch(e) {
    res.status(200).json({ ok: false });
  }
};
