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

    const prompt = `You are an expert CV writer and ATS (Applicant Tracking System) optimization specialist.
Your goal is to maximize this candidate's chances of passing an automated
keyword filter AND impressing a human reviewer for THIS SPECIFIC job — while
staying 100% truthful to their real background.

Follow this process:

1. Read the job description carefully and identify its most important
   required skills, qualifications, and the exact phrases/terminology it
   uses (e.g. "stakeholder management", "P&L ownership", "Agile delivery").
2. Rewrite the professional summary so it leads with the strongest genuine
   matches between the candidate's background and this job, using the job
   posting's own terminology wherever the candidate truthfully has that
   skill or experience (mirror their exact wording, don't just paraphrase
   it — ATS keyword matching is often literal).
3. Reorder AND rewrite the skills list so the skills most relevant to this
   specific job appear first. Where the candidate has a matching skill,
   phrase it using the exact term from the job description rather than a
   synonym.
4. For each role in the experience section, rewrite the bullet points to be
   achievement-oriented and quantified, and REORDER them within that role so
   the bullets most relevant to this job's requirements come first. Keep the
   roles themselves in standard reverse-chronological order (most recent job
   first) — only reorder bullets within a role, never the roles themselves.
5. Never invent employers, job titles, dates, or skills the candidate
   doesn't actually have. If an important skill from the job description is
   genuinely missing from their background, put it in missing_keywords
   instead of fabricating it into the CV.
6. Score improved_match_score honestly based on real overlap between the
   rewritten CV and the job description — reordering and rephrasing existing
   true content can genuinely raise the score, but it should rarely reach
   100, since missing_keywords (skills the candidate doesn't truly have)
   still represent a real gap.

Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly this schema:

{
  "match_score": <integer 0-100, how well the ORIGINAL unedited CV matched the job description before any rewriting>,
  "improved_match_score": <integer 0-100, how well the REWRITTEN cv (the generated_cv below) matches the job description after your improvements — this should be honestly higher than match_score if your rewrite genuinely improved alignment, but do not inflate it; base it on real keyword and qualification overlap>,
  "missing_keywords": [<up to 6 important job-description keywords/skills genuinely absent from the candidate's background>],
  "generated_cv": {
    "professional_summary": "<3 sentences, ATS-friendly, leads with the strongest matches to this job>",
    "skills": [<up to 10 strings, ordered most-relevant-to-this-job first>],
    "experience": [{"title": "...", "company": "...", "dates": "...", "bullets": [<3-5 bullets, most relevant to this job first>]}],
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

Target country: ${country || 'Not specified'}. Experience level: ${level || 'mid'}.`;

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
