// /api/extract-cv.js — Seerah AI
// Uses Claude to extract structured profile data from raw CV text.
// This drives the automatic job search — user doesn't type anything.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { cvText } = req.body || {};
    if (!cvText) {
      res.status(400).json({ error: 'cvText is required' });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });
      return;
    }

    const prompt = `You are a CV parser. Extract structured profile data from this CV.
Respond ONLY with valid JSON — no fences, no extra text:
{
  "jobTitle": "<primary/most recent job title, keep concise e.g. 'Project Manager' or 'Civil Engineer'>",
  "yearsExperience": <integer, total years of professional experience>,
  "topSkills": [<exactly 5 most marketable skills as short strings>],
  "certifications": [<professional certs e.g. "PMP", "NEBOSH" — empty array if none>],
  "educationField": "<degree field e.g. 'Civil Engineering', 'Business Administration'>",
  "seniorityLevel": "<one of: junior, mid, senior, lead>"
}

CV TEXT:
"""
${cvText.slice(0, 7000)}
"""`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      res.status(502).json({ error: 'AI extraction failed', detail: err });
      return;
    }

    const data = await response.json();
    const raw  = (data.content || []).find(c => c.type === 'text')?.text || '';
    const clean = raw.replace(/```(?:json)?|```/gi, '').trim();
    const profile = JSON.parse(clean);

    res.status(200).json(profile);
  } catch (err) {
    res.status(500).json({ error: 'CV extraction failed', detail: err.message });
  }
};
