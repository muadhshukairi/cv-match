// /api/generate.js — Seerah AI (سيرة)
// Supports Arabic and English output via the `language` parameter.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { cvText, jobDescription, country, level, language } = req.body || {};

    if (!cvText || !jobDescription) {
      res.status(400).json({ error: 'cvText and jobDescription are required' });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });
      return;
    }

    const isArabic = language === 'ar';

    const langInstruction = isArabic
      ? `CRITICAL LANGUAGE REQUIREMENT: Generate ALL text content in formal Modern Standard Arabic (الفصحى). This includes: professional_summary, every item in the skills array, every bullet in experience, education entries, cover_letter, AND every interview question. Keep technical software names (AutoCAD, MS Project, Primavera P6, etc.), company names, certifications (PMP, NEBOSH, etc.), and universally English terms (like "AI", "SCADA", "FIDIC") in English or as bilingual Arabic/English as is professionally standard in the Arab Gulf region. All narrative text must be fluent, natural Arabic — not machine-translated.`
      : `Generate all content in English.`;

    const prompt = `You are an expert ATS CV writer and career coach specialising in the GCC job market. Your goal is to maximise this candidate's chances of passing automated keyword filters AND impressing a human reviewer for THIS SPECIFIC job — while staying 100% truthful to their real background.

${langInstruction}

Follow this process precisely:
1. Read the job description carefully and identify its most important required skills, qualifications, and exact phrases/terminology.
2. Rewrite the professional summary so it leads with the strongest genuine matches between the candidate's background and this job, using the job posting's own terminology where the candidate truthfully has that skill.
3. Reorder AND rewrite the skills list — most relevant to THIS specific job first. Where the candidate has a matching skill, phrase it using the exact term from the job description rather than a synonym (ATS keyword matching is often literal).
4. For each role in experience, rewrite the bullet points to be achievement-oriented and quantified, and REORDER them so the most relevant to this job's requirements come first. Keep roles in standard reverse-chronological order.
5. Score improved_match_score honestly — reordering and rephrasing existing true content can genuinely raise the score, but it should not reach 100 if skills are genuinely missing.
6. Never invent employers, job titles, dates, or skills the candidate does not actually have. Genuinely missing skills go in missing_keywords.

Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly this schema:
{
  "match_score": <integer 0-100, honest ATS keyword match of the ORIGINAL unedited CV against this job — be strict: most CVs score 20-55 before rewriting>,
  "improved_match_score": <integer 0-100, honest ATS keyword match AFTER rewriting — should be meaningfully higher than before (typically +15 to +35 points) but never exceed 92 — be realistic>,
  "missing_keywords": [<up to 6 important job-description keywords genuinely absent from the candidate's background>],
  "generated_cv": {
    "professional_summary": "<3 ATS-friendly sentences, leads with strongest matches to this job>",
    "skills": [<up to 10 strings, ordered most-relevant-to-this-job first>],
    "experience": [{"title": "...", "company": "...", "dates": "...", "bullets": [<3-5 bullets, most relevant to this job first>]}],
    "education": [<plain strings>]
  },
  "cover_letter": "<3-4 paragraphs, plain text, tailored to this specific role and company>",
  "interview_questions": [<8-10 strings tailored to this specific role>]
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

    // Increment CV improved counter
    try {
      const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
      if (redisUrl && redisToken) {
        fetch(`${redisUrl}/INCR/seerah:improved`, { headers: { Authorization: `Bearer ${redisToken}` } });
      }
    } catch(e2) {}
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', detail: err.message });
  }
};
