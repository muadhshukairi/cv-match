// /api/find-jobs.js — Seerah AI
// Fetches live, recent job postings via JSearch API.
// Key fix: date_posted=month ensures no stale results.

const COUNTRY_CODES = {
  Oman:'om', UAE:'ae', 'Saudi Arabia':'sa',
  Qatar:'qa', Bahrain:'bh', Kuwait:'kw',
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { jobTitle, skills, country } = req.body || {};

    if (!jobTitle) {
      res.status(400).json({ error: 'jobTitle is required' });
      return;
    }

    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing RAPIDAPI_KEY' });
      return;
    }

    // Strip seniority prefixes to broaden the search
    function coreTitle(t) {
      return (t || '')
        .split(/[-–—/|]/)[0]
        .replace(/\b(senior|junior|lead|principal|associate|chief|head of)\b/gi, '')
        .replace(/\s+/g, ' ').trim();
    }

    const core   = coreTitle(jobTitle) || jobTitle;
    const skills2 = (Array.isArray(skills) ? skills : []).slice(0, 2).join(' ');

    // Progressive queries: specific → broader
    const queries = [
      `${core} jobs in ${country}`,
      `${core} ${skills2} jobs in ${country}`,
      `${core} jobs`,
    ].filter(q => q.replace(/jobs(?: in \w+)?/i,'').trim().length > 0);

    async function search(query) {
      const params = new URLSearchParams({
        query,
        page: '1',
        num_pages: '2',
        date_posted: 'month',   // ← ONLY jobs posted in the last 30 days
      });

      const r = await fetch(
        `https://jsearch.p.rapidapi.com/search-v2?${params}`,
        {
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
          },
        }
      );
      if (!r.ok) throw new Error(`JSearch ${r.status}`);
      const d = await r.json();
      return (d.data && d.data.jobs) || d.data || [];
    }

    let raw = [], queryUsed = '';
    for (const q of queries) {
      raw = await search(q);
      queryUsed = q;
      if (raw.length > 0) break;
    }

    // Calculate days since posted
    function daysAgo(iso) {
      if (!iso) return null;
      const ms = Date.now() - new Date(iso).getTime();
      return Math.max(0, Math.floor(ms / 86400000));
    }

    const jobs = raw.slice(0, 8).map(j => ({
      id:          j.job_id,
      title:       j.job_title        || '',
      company:     j.employer_name    || '',
      location:    [j.job_city, j.job_country].filter(Boolean).join(', ') || country,
      type:        j.job_employment_type || 'Full-time',
      desc:        (j.job_description || '').slice(0, 3000),  // ← crucial for AI tailoring
      apply_link:  j.job_apply_link   || j.job_google_link || '',
      posted_at:   j.job_posted_at_datetime_utc || null,
      days_ago:    daysAgo(j.job_posted_at_datetime_utc),
    }));

    res.status(200).json({ jobs, query_used: queryUsed });
  } catch (err) {
    res.status(500).json({ error: 'Job search failed', detail: err.message });
  }
};
