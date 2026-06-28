// /api/generate.js
// One serverless function. Vercel auto-detects anything in /api as a
// function — no extra config, no build step, no framework needed.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { cvText, jobDescription, country, level } = req.body || {};

    if (!cvText || !jobDescription) {
      res.status(400).json({ error: 'cvText and jobDescription are required' });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });
      return;
    }

    const prompt = `You are an expert CV writer. Tailor this candidate's CV to the job description below.
Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly this schema:

{
  "match_score": <integer 0-100>,
  "missing_keywords": [<up to 6 strings>],
  "generated_cv": {
    "professional_summary": "<3 sentences, ATS-friendly>",
    "skills": [<up to 10 strings>],
    "experience": [{"title": "...", "company": "...", "dates": "...", "bullets": [<3-5 improved, achievement-oriented bullets>]}],
    "education": [<plain strings>]
  },
  "cover_letter": "<3-4 paragraphs, plain text>",
  "interview_questions": [<8-10 strings>]
}

CANDIDATE'S CURRENT CV:
"""
${cvText.slice(0, 8000)}
"""

TARGET JOB DESCRIPTION:
"""
${jobDescription.slice(0, 4000)}
"""

Target country: ${country || 'Not specified'}. Experience level: ${level || 'mid'}.
Keep all content honest and grounded in the original CV — improve phrasing and keyword
alignment, never invent employers, titles, or qualifications that aren't implied by the original.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: 'AI request failed', detail: errText });
      return;
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((c) => c.type === 'text');
    if (!textBlock) {
      res.status(502).json({ error: 'No content returned from AI' });
      return;
    }

    const fenced = textBlock.text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonString = (fenced ? fenced[1] : textBlock.text).trim();

    let result;
    try {
      result = JSON.parse(jsonString);
    } catch (e) {
      res.status(502).json({ error: 'Could not parse AI response as JSON' });
      return;
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', detail: err.message });
  }
};
