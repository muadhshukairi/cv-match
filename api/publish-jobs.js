// /api/publish-jobs.js — Seerah AI
// Publishes job to Google Sheets. Uploads image to ImgBB for clear display.

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzo9yLuujndd1KKl1hQ-yd8Av_GgL7yJ_8m_IcZycsr1nMe9BTfO2ZqYQgCqiKjMFzV/exec';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  res.setHeader('Content-Type', 'application/json');

  const job = req.body || {};
  let imageUrl = '';

  // Upload image to ImgBB if available
  if (job.image_thumb && process.env.IMGBB_API_KEY) {
    try {
      // Remove data:image/jpeg;base64, prefix
      const base64 = job.image_thumb.replace(/^data:image\/\w+;base64,/, '');
      const form = new URLSearchParams();
      form.append('image', base64);
      form.append('name', 'seerah-job-' + Date.now());

      const imgRes = await fetch(
        `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
        { method: 'POST', body: form }
      );
      const imgData = await imgRes.json();
      if (imgData.success) {
        imageUrl = imgData.data.display_url || imgData.data.url;
        console.log('ImgBB upload OK:', imageUrl);
      }
    } catch(e) {
      console.log('ImgBB upload failed:', e.message);
      // Fall back to storing nothing
    }
  }

  try {
    const r = await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:      'publishJob',
        title_en:    job.title_en     || '',
        title_ar:    job.title_ar     || '',
        company:     job.company      || '',
        location:    job.location     || 'Oman',
        type:        job.type         || 'Full-time',
        deadline:    job.deadline     || '',
        requirements:job.requirements || [],
        contact:     job.contact      || '',
        source:      job.source       || 'Instagram',
        omani_only:  job.omani_only   || false,
        image_thumb: imageUrl,         // store ImgBB URL, not base64
      }),
    });
    const d = await r.json();
    res.status(200).json(d);
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
