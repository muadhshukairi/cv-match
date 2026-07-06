// /api/visit.js — logs a page visit with country to Google Sheets
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzo9yLuujndd1KKl1hQ-yd8Av_GgL7yJ_8m_IcZycsr1nMe9BTfO2ZqYQgCqiKjMFzV/exec';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Vercel automatically adds this header with the visitor's country code
  const country = req.headers['x-vercel-ip-country'] || 'Unknown';
  try {
    await fetch(`${SHEETS_URL}?event=visit&detail=${encodeURIComponent(country)}`);
  } catch(e) {}
  res.status(200).json({ ok: true });
};
