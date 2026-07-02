// /api/find-jobs.js — Seerah AI
// Runs 2 parallel searches (specific + broader title) for wider, accurate results.

const COUNTRY_CODES = {
  Oman:'om',UAE:'ae','Saudi Arabia':'sa',Qatar:'qa',Bahrain:'bh',Kuwait:'kw',
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const { jobTitle, skills, country } = req.body || {};
  if (!jobTitle) { res.status(400).json({ error: 'jobTitle required' }); return; }
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Missing RAPIDAPI_KEY' }); return; }

  try {
    const countryCode = COUNTRY_CODES[country] || '';
    const topSkills   = (Array.isArray(skills) ? skills : []).slice(0, 2).join(' ');

    // Strip seniority for a broader variant — "Senior Project Engineer" -> "Project Engineer"
    const coreTitle = jobTitle
      .replace(/\b(senior|sr\.?|lead|principal|chief|head of|junior|jr\.?|associate)\b/gi, '')
      .replace(/\s+/g, ' ').trim();

    // Two queries: (1) exact + skills, (2) core title without seniority
    const queries = [...new Set([
      [jobTitle, topSkills, country ? 'in '+country : ''].filter(Boolean).join(' ').trim(),
      [coreTitle, country ? 'in '+country : ''].filter(Boolean).join(' ').trim(),
    ])].filter(Boolean);

    async function search(query) {
      const params = new URLSearchParams({
        query, page:'1', num_pages:'1', date_posted:'month',
        ...(countryCode ? { country: countryCode } : {}),
      });
      const r = await fetch(
        'https://jsearch.p.rapidapi.com/search?' + params.toString(),
        { method:'GET', headers:{ 'X-RapidAPI-Key':apiKey, 'X-RapidAPI-Host':'jsearch.p.rapidapi.com' } }
      );
      if (!r.ok) return [];
      const d = await r.json();
      return d.data || [];
    }

    // Run in parallel, merge, deduplicate
    const batches = await Promise.all(queries.map(search));
    const seen = new Set();
    const merged = [];
    for (const batch of batches) {
      for (const j of batch) {
        const uid = j.job_id || (j.employer_name + '|' + j.job_title);
        if (!seen.has(uid)) { seen.add(uid); merged.push(j); }
      }
    }

    function daysAgo(iso) {
      if (!iso) return null;
      return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
    }

    const jobs = merged.slice(0, 10).map(j => ({
      id:         j.job_id || '',
      title:      j.job_title           || '',
      company:    j.employer_name       || '',
      location:   [j.job_city, j.job_country].filter(Boolean).join(', ') || country || '',
      type:       j.job_employment_type || 'Full-time',
      desc:       (j.job_description   || '').slice(0, 3000),
      apply_link: j.job_apply_link     || j.job_google_link || '',
      days_ago:   daysAgo(j.job_posted_at_datetime_utc),
    }));

    res.status(200).json({ jobs, queries_used: queries });

  } catch (e) {
    res.status(500).json({ error: 'Search failed', detail: e.message });
  }
};
