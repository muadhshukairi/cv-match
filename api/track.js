// /api/track.js — Seerah AI
// Logs events to Google Sheets via Apps Script GET webhook
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzo9yLuujndd1KKl1hQ-yd8Av_GgL7yJ_8m_IcZycsr1nMe9BTfO2ZqYQgCqiKjMFzV/exec';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const event  = req.query.event  || 'unknown';
  const detail = req.query.detail || '-';

  try {
    // Use GET with query params — more reliable with Apps Script
    const url = `${SHEETS_URL}?event=${encodeURIComponent(event)}&detail=${encodeURIComponent(detail)}`;
    const r = await fetch(url, { method: 'GET' });
    const text = await r.text();
    console.log('Sheets response:', r.status, text);
    res.status(200).json({ ok: true, sheets_response: text });
  } catch(e) {
    console.log('Track error:', e.message);
    res.status(200).json({ ok: false, error: e.message });
  }
};
