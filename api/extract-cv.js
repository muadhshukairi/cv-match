// /api/extract-cv.js — Seerah AI
// Extracts profile AND multiple search queries — one per experience area.
// A customer service + admin + operations person gets 3 parallel searches.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const { cvText } = req.body || {};
  if (!cvText) { res.status(400).json({ error: 'cvText required' }); return; }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' }); return; }

  try {
    const prompt = `You are a career consultant. Read this CV carefully and extract ALL experience areas.

Key rule: A person may have experience in multiple fields. Generate a separate search query for EACH distinct experience area so the job search covers everything.

Examples:
- CV has wastewater ops + customer service + admin → 3 queries: "Operations Administrator", "Customer Service", "Administrative Coordinator"  
- CV has civil engineering + project management + site inspection → 3 queries: "Civil Engineer", "Project Manager", "Site Engineer"
- CV has only one clear field → 1-2 queries

Return ONLY valid JSON, no markdown fences:
{
  "candidateName": "<full name of the person — look carefully, may be ALL-CAPS or formatted unusually>",
  "email": "<email address if found, empty string if not>",
  "phone": "<phone number if found, empty string if not>",
  "location": "<city and country if found, e.g. Muscat, Oman, empty string if not>",
  "jobTitle": "<their actual current job title from CV>",
  "searchTitle": "<primary broad job title for searching, 2-3 words, sector-agnostic>",
  "searchQueries": [<2-4 short search terms, each 1-3 words, covering ALL experience areas in this CV — e.g. ["Operations Administrator","Customer Service","Administrative Coordinator"]>],
  "yearsExperience": <integer>,
  "topSkills": [<5 transferable skills that work across sectors>],
  "certifications": [<professional certs, empty array if none>],
  "educationField": "<degree field or highest qualification>",
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
        max_tokens: 600,
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

    // Ensure searchQueries always exists
    if (!profile.searchQueries || !profile.searchQueries.length) {
      profile.searchQueries = [profile.searchTitle || profile.jobTitle || 'Engineer'];
    }

    // Fallback for searchTitle
    if (!profile.searchTitle) {
      profile.searchTitle = profile.searchQueries[0] || profile.jobTitle;
    }

    // Increment CV upload counter (awaited so Vercel doesn't kill it early)
    try {
      const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
      if (redisUrl && redisToken) {
        await fetch(`${redisUrl}/INCR/seerah_cvs`, { headers: { Authorization: `Bearer ${redisToken}` } });
      }
    } catch(e2) {}
    res.status(200).json(profile);
  } catch (e) {
    res.status(500).json({ error: 'CV extraction failed', detail: e.message });
  }
};
