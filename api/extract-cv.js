// /api/extract-cv.js — Seerah AI
// Extracts structured profile AND generates a broad, sector-agnostic search title
// so the job search finds opportunities across multiple industries.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const { cvText } = req.body || {};
  if (!cvText) { res.status(400).json({ error: 'cvText required' }); return; }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' }); return; }

  try {
    const prompt = `You are a career consultant and CV analyst. Read this CV carefully.

Your job is to understand the person's REAL transferable skills and generate a broad, marketable job search title that will find the widest range of suitable opportunities — not just jobs in their current sector.

Examples of good thinking:
- "Wastewater Operations & Service Connection Administrator" → searchTitle: "Operations Administrator" (works in any sector)
- "Senior Project Engineer O&M Water Networks" → searchTitle: "Senior Project Engineer" (broad, not water-specific)
- "Civil/Structural Site Inspector at Airport" → searchTitle: "Site Engineer" (applicable everywhere)
- Someone with customer service + admin + coordination experience → searchTitle: "Operations Coordinator" or "Administrator"

Return ONLY valid JSON, no markdown fences:
{
  "jobTitle": "<their actual current title, as-is from CV>",
  "searchTitle": "<BROAD, SECTOR-AGNOSTIC title for job searching — 2-3 words max, e.g. 'Project Engineer', 'Operations Manager', 'Administrator', 'Site Engineer'>",
  "yearsExperience": <integer>,
  "topSkills": [<5 TRANSFERABLE skills that work across sectors — not company-specific terms>],
  "certifications": [<professional certs, empty array if none>],
  "educationField": "<degree field or highest education>",
  "seniorityLevel": "<junior|mid|senior|lead>"
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

    // Ensure searchTitle is always set — fallback to stripped jobTitle
    if (!profile.searchTitle) {
      profile.searchTitle = (profile.jobTitle || '')
        .replace(/\b(senior|sr\.?|junior|jr\.?|lead|principal|chief|head of)\b/gi, '')
        .replace(/\b(water|wastewater|sewer|pipeline|airport|railway|oil|gas|petrochemical)\b/gi, '')
        .replace(/\s+/g, ' ').trim()
        .split(/[&,|]/)[0].trim() || 'Engineer';
    }

    res.status(200).json(profile);
  } catch (e) {
    res.status(500).json({ error: 'CV extraction failed', detail: e.message });
  }
};
