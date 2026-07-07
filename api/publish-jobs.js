// /api/publish-jobs.js — Seerah AI
// Publishes a job to Google Sheets. Returns duplicate warning if already exists.

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzo9yLuujndd1KKl1hQ-yd8Av_GgL7yJ_8m_IcZycsr1nMe9BTfO2ZqYQgCqiKjMFzV/exec';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  res.setHeader('Content-Type', 'application/json');

  const job = req.body || {};
  try {
    const params = new URLSearchParams({
      action:       'publishJob',
      title_en:     job.title_en     || '',
      title_ar:     job.title_ar     || '',
      company:      job.company      || '',
      location:     job.location     || 'Oman',
      type:         job.type         || 'Full-time',
      deadline:     job.deadline     || '',
      requirements: (job.requirements || []).join('|'),
      contact:      job.contact      || '',
      source:       job.source       || 'Instagram',
      omani_only:   job.omani_only   ? 'true' : 'false',
    });
    const r = await fetch(`${SHEETS_URL}?${params.toString()}`);
    const d = await r.json();
    res.status(200).json(d);
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
