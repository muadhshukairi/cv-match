// /api/find-jobs.js — Seerah AI
// Temporary: uses JSearch (RapidAPI) while SerpAPI registration is pending.
// Replace with the SerpAPI version once SERPAPI_KEY is added to Vercel.

const COUNTRY_CODES = {
  Oman: 'om', UAE: 'ae', 'Saudi Arabia': 'sa',
  Qatar: 'qa', Bahrain: 'bh', Kuwait: 'kw',
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { jobTitle, searchTitle, searchQueries, country } = req.body || {};

    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Missing RAPIDAPI_KEY in Vercel environment variables' });
      return;
    }

    const loc = country || 'Oman';
    const countryCode = COUNTRY_CODES[loc] || '';

    // Build queries from all CV experience areas
    let queries = [];
    if (searchQueries && searchQueries.length) {
      queries = searchQueries.map(q => q.replace(/\b(senior|sr\.?|lead|principal)\b/gi,'').trim());
    } else {
      const base = searchTitle || jobTitle || 'engineer';
      queries = [base.replace(/\b(senior|sr\.?|lead|principal)\b/gi,'').trim()];
    }
    queries = [...new Set(queries)].filter(Boolean).slice(0, 3);

    async function search(query) {
      const params = new URLSearchParams({
        query: query + ' ' + loc,
        page: '1',
        num_pages: '1',
        ...(countryCode ? { country: countryCode } : {}),
      });
      try {
        const r = await fetch(
          'https://jsearch.p.rapidapi.com/search-v2?' + params.toString(),
          {
            method: 'GET',
            headers: {
              'X-RapidAPI-Key': apiKey,
              'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
            },
          }
        );
        if (!r.ok) {
          console.log('JSearch error:', r.status, await r.text());
          return [];
        }
        const d = await r.json();
        if (Array.isArray(d.data?.jobs)) return d.data.jobs;
        if (Array.isArray(d.data))       return d.data;
        return [];
      } catch(e) {
        console.log('JSearch fetch failed:', e.message);
        return [];
      }
    }

    console.log('JSearch queries:', queries);
    const batches = await Promise.all(queries.map(search));

    // Merge + deduplicate
    const seen = new Set();
    const merged = [];
    for (const batch of batches) {
      for (const j of batch) {
        const uid = (j.employer_name || '') + '|' + (j.job_title || '');
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
      location:   [j.job_city, j.job_country].filter(Boolean).join(', ') || loc,
      type:       j.job_employment_type || 'Full-time',
      desc:       (j.job_description   || '').slice(0, 3000),
      apply_link: j.job_apply_link     || j.job_google_link || '',
      source:     '',
      days_ago:   daysAgo(j.job_posted_at_datetime_utc),
    }));

    res.status(200).json({ jobs, queries_used: queries });

  } catch (e) {
    res.status(500).json({ error: 'Unexpected error: ' + e.message });
  }
};
