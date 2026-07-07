// /api/read-job-image.js — Seerah AI
// Receives a base64 image, sends to Claude Vision, returns structured jobs array

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  res.setHeader('Content-Type', 'application/json');

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) { res.status(400).json({ error: 'imageBase64 required' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' }); return; }

  try {
    const prompt = `You are a job listing extractor. Read this image carefully — it is an Instagram post or screenshot advertising job vacancies.

Extract ALL job listings you can find. For each job return:
- title_en: English job title (translate if Arabic)
- title_ar: Arabic job title (transliterate if English)
- company: company name
- location: city/country (default "Oman" if not specified)
- type: Full-time / Part-time / Internship / Contract
- deadline: application deadline if mentioned, null if not
- requirements: array of requirement strings (empty array if not mentioned)
- contact: email, phone, or apply link
- source: "Instagram"
- omani_only: true if post says "Omani nationals only" or similar, false otherwise

Return ONLY valid JSON array, no fences, no extra text:
[
  {
    "title_en": "...",
    "title_ar": "...",
    "company": "...",
    "location": "...",
    "type": "...",
    "deadline": null,
    "requirements": [],
    "contact": "...",
    "source": "Instagram",
    "omani_only": false
  }
]

If no jobs found, return empty array: []`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      }),
    });

    const data = await response.json();
    const raw = (data.content || []).find(c => c.type === 'text')?.text || '[]';
    const clean = raw.replace(/```(?:json)?|```/gi, '').trim();
    const jobs = JSON.parse(clean);
    res.status(200).json({ jobs });

  } catch(e) {
    res.status(500).json({ error: 'Extraction failed: ' + e.message });
  }
};
