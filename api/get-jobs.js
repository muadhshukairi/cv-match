// /api/get-jobs.js — Seerah AI
// Returns all published jobs from Google Sheets for the public job board

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzo9yLuujndd1KKl1hQ-yd8Av_GgL7yJ_8m_IcZycsr1nMe9BTfO2ZqYQgCqiKjMFzV/exec';

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch(`${SHEETS_URL}?action=getJobs`);
    const jobs = await r.json();
    res.status(200).json({ jobs: Array.isArray(jobs) ? jobs : [] });
  } catch(e) {
    res.status(200).json({ jobs: [], error: e.message });
  }
};
