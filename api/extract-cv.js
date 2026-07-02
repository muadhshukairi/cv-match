// /api/extract-cv.js — Seerah AI
// Claude reads the raw CV semantically and extracts structured job search terms.
// Understands context: "planned works with scheduling software" → Primavera, MS Project.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { cvText } = req.body || {};
  if (!cvText) { res.status(400).json({ error: 'cvText required' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' }); return; }

  try {
    const prompt = `You are a CV parser for the Gulf job market. Read this CV carefully and extract search terms.
Be smart: infer skills from context, not just stated keywords.
- "planned works using scheduling software" → include Primavera P6, MS Project
- "managed site teams on infrastructure" → include Site Engineer, Project Manager  
- "coordinated with authorities and clients" → include Stakeholder Management
- Infer the most marketable version of their role

Return ONLY valid JSON, no markdown fences, no extra text:
{
  "jobTitle": "<primary role, concise, in English — e.g. 'Project Engineer' or 'Civil Engineer'>",
  "yearsExperience": <integer total professional years>,
  "topSkills": [<exactly 5 strings — mix of stated AND inferred skills>],
  "certifications": [<e.g. "PMP","NEBOSH" — empty array if none found>],
  "educationField": "<e.g. 'Civil Engineering' or 'Mechanical Engineering'>",
  "seniorityLevel": "<one of: junior / mid / senior / lead>"
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
      res.status(502).json({ error: 'AI call failed', detail: err });
      return;
    }

    const data = await response.json();
    const raw  = (data.content || []).find(c => c.type === 'text')?.text || '';
    const clean = raw.replace(/```(?:json)?|```/gi, '').trim();
    const profile = JSON.parse(clean);
    res.status(200).json(profile);

  } catch (e) {
    res.status(500).json({ error: 'CV extraction failed', detail: e.message });
  }
};
