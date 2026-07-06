// /api/track.js — Seerah AI
// Logs events to Google Sheets via Apps Script webhook
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzo9yLuujndd1KKl1hQ-yd8Av_GgL7yJ_8m_IcZycsr1nMe9BTfO2ZqYQgCqiKjMFzV/exec';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const event  = req.query.event  || 'unknown';
  const detail = req.query.detail || '-';

  try {
    await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, detail }),
    });
    res.status(200).json({ ok: true });
  } catch(e) {
    res.status(200).json({ ok: false, error: e.message });
  }
};
