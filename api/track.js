// /api/track.js — Seerah AI
// Logs events to Google Sheets via Apps Script GET webhook, and pushes a
// Telegram notification to your phone for the two events that matter most:
// someone uploading a CV ('cvs') and someone finishing an improvement
// ('improved'). Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID as environment
// variables in Vercel (Project Settings → Environment Variables) — if either
// is missing, the Telegram step is silently skipped and Sheets logging still
// works exactly as before.
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzo9yLuujndd1KKl1hQ-yd8Av_GgL7yJ_8m_IcZycsr1nMe9BTfO2ZqYQgCqiKjMFzV/exec';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

// Only these two events trigger a phone notification — everything else
// (upload_card_seen, jobboard_image_click, etc.) still logs to Sheets as
// usual but stays quiet, so your phone isn't buzzing for every click.
const NOTIFY_EVENTS = {
  cvs:      { emoji: '📄', label: 'New CV uploaded' },
  improved: { emoji: '✦',  label: 'CV improved' },
};

async function sendTelegramNotification(event, detail) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return; // not configured yet — skip quietly
  const cfg = NOTIFY_EVENTS[event];
  if (!cfg) return;

  const text = `${cfg.emoji} ${cfg.label} on Seerah AI` + (detail && detail !== '-' ? `\n${detail}` : '');
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
  } catch (e) {
    console.log('Telegram notify error:', e.message); // never let this break tracking
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const event  = req.query.event  || 'unknown';
  const detail = req.query.detail || '-';

  // Fire the Telegram notification without waiting on it — it should never
  // slow down or break the actual tracking response.
  sendTelegramNotification(event, detail).catch(() => {});

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
