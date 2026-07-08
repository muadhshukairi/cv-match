// /api/get-jobs.js — Seerah AI
// Returns all published jobs from Google Sheets including image_thumb

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzo9yLuujndd1KKl1hQ-yd8Av_GgL7yJ_8m_IcZycsr1nMe9BTfO2ZqYQgCqiKjMFzV/exec';

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch(`${SHEETS_URL}?action=getJobs`);
    const jobs = await r.json();
    // Ensure image_thumb is included
    const list = Array.isArray(jobs) ? jobs : [];
    res.status(200).json({ jobs: list.map(function(j) {
      return {
        id:          j.id          || '',
        date:        j.date        || '',
        title_en:    j.title_en    || '',
        title_ar:    j.title_ar    || '',
        company:     j.company     || '',
        location:    j.location    || 'Oman',
        type:        j.type        || 'Full-time',
        deadline:    j.deadline    || '',
        requirements:j.requirements|| [],
        contact:     j.contact     || '',
        source:      j.source      || '',
        omani_only:  j.omani_only  || false,
        image_thumb: j.image_thumb || '',
      };
    })});
  } catch(e) {
    res.status(200).json({ jobs: [], error: e.message });
  }
};
