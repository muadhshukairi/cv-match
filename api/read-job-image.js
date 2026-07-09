// /api/read-job-image.js — Seerah AI
// Claude Vision reads the screenshot, extracts jobs with bounding boxes + QR code URLs

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  res.setHeader('Content-Type', 'application/json');

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) { res.status(400).json({ error: 'imageBase64 required' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' }); return; }

  try {
    const prompt = `You are a job listing extractor. Read this image carefully — it may contain one or multiple Instagram job posts.

For EACH job listing you find, return:
- title_en: English job title
- title_ar: Arabic job title
- company: company name
- location: city/country (default "Oman" if not specified)
- type: Full-time / Part-time / Internship / Contract
- deadline: application deadline if mentioned, null if not
- requirements: array of requirement strings
- contact: email, phone, WhatsApp number, or website
- source: "Instagram"
- omani_only: true if post says Omani nationals only, else false
- qr_url: If there is a QR code visible in this specific job post, decode it and return the full URL it encodes. Return null if no QR code or unreadable.
- bbox: Bounding box of THIS job post within the full image, as percentage of total image dimensions:
  { "x": left edge %, "y": top edge %, "w": width %, "h": height % }
  Example: if the job post occupies the top-left quarter → {"x":0,"y":0,"w":50,"h":50}
  If only one job in the image → {"x":0,"y":0,"w":100,"h":100}

IMPORTANT for bbox: Be as accurate as possible. Each job post has its own distinct visual boundary. Estimate the pixel region carefully.

Return ONLY valid JSON array, no fences:
[
  {
    "title_en": "...",
    "title_ar": "...",
    "company": "...",
    "location": "...",
    "type": "Full-time",
    "deadline": null,
    "requirements": [],
    "contact": "...",
    "source": "Instagram",
    "omani_only": false,
    "qr_url": null,
    "bbox": {"x":0,"y":0,"w":100,"h":100}
  }
]

If no jobs found, return: []`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: 'AI request failed (' + response.status + ')', detail: errText.slice(0, 500) });
      return;
    }

    const data = await response.json();
    const textBlock = (data.content || []).find(c => c.type === 'text');
    if (!textBlock) {
      res.status(502).json({ error: 'No content returned from AI', detail: JSON.stringify(data).slice(0, 500) });
      return;
    }

    const raw = textBlock.text || '[]';
    const clean = raw.replace(/```(?:json)?|```/gi, '').trim();

    let jobs;
    try {
      jobs = JSON.parse(clean);
    } catch (parseErr) {
      res.status(502).json({ error: 'Could not parse AI response as JSON', detail: clean.slice(0, 500) });
      return;
    }

    res.status(200).json({ jobs });

  } catch(e) {
    res.status(500).json({ error: 'Extraction failed: ' + e.message });
  }
};
