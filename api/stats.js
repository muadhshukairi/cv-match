// /api/stats.js — reads counts + countries from Google Sheets
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzo9yLuujndd1KKl1hQ-yd8Av_GgL7yJ_8m_IcZycsr1nMe9BTfO2ZqYQgCqiKjMFzV/exec';

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch(`${SHEETS_URL}?action=count`);
    const d = await r.json();
    res.status(200).json({
      cvs:       d.cvs       || 0,
      searches:  d.searches  || 0,
      improved:  d.improved  || 0,
      visits:    d.visits    || 0,
      // New funnel-detail counters — these read as 0 until the Apps Script
      // webhook is updated to count these three event names from the log
      // sheet (see the addition needed in trackEvent/doGet's count branch).
      upload_card_seen: d.upload_card_seen || 0,
      upload_clicked:   d.upload_clicked   || 0,
      file_selected:    d.file_selected    || 0,
      // Daily jobs board engagement — already firing in index.html
      // (jobboard_image_click, jobboard_cta_clicked), just not surfaced here yet.
      jobboard_image_click:  d.jobboard_image_click  || 0,
      jobboard_cta_clicked:  d.jobboard_cta_clicked  || 0,
      whatsapp_share_clicked: d.whatsapp_share_clicked || 0,
      countries: d.countries || {},
      upstash_connected: true,
    });
  } catch(e) {
    res.status(200).json({ cvs:0, searches:0, improved:0, visits:0, countries:{}, error:e.message });
  }
};
