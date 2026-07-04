// /api/find-jobs.js — Seerah AI
// Runs ALL searchQueries in parallel — one per CV experience area.
// Merges + deduplicates results for the widest accurate coverage.

const COUNTRY_CODES = {
  Oman:'om', UAE:'ae', 'Saudi Arabia':'sa',
  Qatar:'qa', Bahrain:'bh', Kuwait:'kw',
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { jobTitle, searchTitle, searchQueries, country } = req.body || {};
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Missing RAPIDAPI_KEY' }); return; }

  try {
    const countryCode = COUNTRY_CODES[country] || '';
    const loc = country || 'Oman';

    // Build the list of queries to run
    // Use searchQueries if provided, otherwise fall back to searchTitle or jobTitle
    let queries = [];
    if (searchQueries && searchQueries.length) {
      // Each query: "{experience area} {country}"
      queries = searchQueries.map(function(q) {
        return (q + ' ' + loc).trim();
      });
    } else {
      const base = searchTitle || jobTitle || 'engineer';
      const core = base.replace(/\b(senior|sr\.?|lead|principal|chief|head of|junior|jr\.?|associate)\b/gi,'').replace(/\s+/g,' ').trim();
      queries = [core + ' ' + loc];
    }

    // Deduplicate queries
    queries = [...new Set(queries)].filter(Boolean).slice(0, 4); // max 4 parallel searches

    async function search(query) {
      const params = new URLSearchParams({
        query,
        page:      '1',
        num_pages: '1',
        ...(countryCode ? { country: countryCode } : {}),
      });
      try {
        const r = await fetch(
          'https://jsearch.p.rapidapi.com/search-v2?' + params.toString(),
          {
            method: 'GET',
            headers: {
              'X-RapidAPI-Key':  apiKey,
              'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
            },
          }
        );
        if (!r.ok) {
          console.log('JSearch error for query "'+query+'": '+r.status);
          return [];
        }
        const d = await r.json();
        // search-v2 response: data.jobs or data (array)
        if (Array.isArray(d.data?.jobs)) return d.data.jobs;
        if (Array.isArray(d.data))       return d.data;
        return [];
      } catch(e) {
        console.log('Search failed for "'+query+'": '+e.message);
        return [];
      }
    }

    // Run all in parallel
    console.log('Running ' + queries.length + ' parallel searches:', queries);
    const batches = await Promise.all(queries.map(search));

    // Merge + deduplicate by job_id
    const seen = new Set();
    const merged = [];
    for (const batch of batches) {
      for (const j of batch) {
        const uid = j.job_id || (j.employer_name + '|' + j.job_title);
        if (!seen.has(uid)) { seen.add(uid); merged.push(j); }
      }
    }

    console.log('Total merged results:', merged.length);

    function daysAgo(iso) {
      if (!iso) return null;
      return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
    }

    const jobs = merged.slice(0, 12).map(j => ({
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
    res.status(500).json({ error: 'Unexpected error: ' + e.message });
  }
};
