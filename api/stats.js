// /api/stats.js — Seerah AI
// Reads event counts from Google Sheets

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzo9yLuujndd1KKl1hQ-yd8Av_GgL7yJ_8m_IcZycsr1nMe9BTfO2ZqYQgCqiKjMFzV/exec';

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch(`${SHEETS_URL}?action=count`);
    const text = await r.text();
    console.log('Sheets count response:', text);
    const d = JSON.parse(text);
    res.status(200).json({
      cvs:      d.cvs      || 0,
      searches: d.searches || 0,
      improved: d.improved || 0,
      upstash_connected: true,
    });
  } catch(e) {
    console.log('Stats error:', e.message);
    res.status(200).json({ cvs:0, searches:0, improved:0, error: e.message });
  }
};
