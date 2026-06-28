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
   the bullets most
