// /api/find-jobs.js — Seerah AI
// Uses SerpAPI (Google Jobs) instead of JSearch.
// Google Jobs indexes LinkedIn, Indeed, Naukrigulf, Bayt, GulfTalent, BeBee
// and all other job sites — giving the same results the user sees on Google.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { jobTitle, searchTitle, searchQueries, country } = req.body || {};
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'SERPAPI_KEY is not set. Sign up free at serpapi.com and add the key to Vercel environment variables.',
    });
    return;
  }

  try {
    const loc = country || 'Oman';

    // Build queries from all experience areas
    let queries = [];
    if (searchQueries && searchQueries.length) {
      queries = searchQueries.map(q => `${q} ${loc}`.trim());
    } else {
      const base = searchTitle || jobTitle || 'engineer';
      queries = [`${base} ${loc}`.trim()];
    }
    queries = [...new Set(queries)].filter(Boolean).slice(0, 3);

    async function searchGoogle(query) {
      const params = new URLSearchParams({
        engine:  'google_jobs',
        q:       query,
        hl:      'en',
        gl:      'om',           // Google country: Oman
        api_key: apiKey,
      });
      try {
        const r = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
        if (!r.ok) {
          const err = await r.text();
          console.log(`SerpAPI error for "${query}": ${r.status} — ${err.slice(0,200)}`);
          return [];
        }
        const d = await r.json();
        return d.jobs_results || [];
      } catch (e) {
        console.log(`SerpAPI fetch failed for "${query}": ${e.message}`);
        return [];
      }
    }

    // Jadarah OIA — search Google with site:jadarah.oia.gov.om
    async function searchJadarah(query) {
      const params = new URLSearchParams({
        engine: 'google',
        q: query.replace(/ Oman$/, '').trim() + ' site:jadarah.oia.gov.om',
        num: '10', hl: 'en', api_key: apiKey,
      });
      try {
        const r = await fetch('https://serpapi.com/search.json?' + params.toString());
        if (!r.ok) return [];
        const d = await r.json();
        return (d.organic_results || [])
          .filter(x => x.link && x.link.includes('jadarah'))
          .map(x => ({
            job_id: x.link,
            title: (x.title || '').split(/\s*[-|]/)[0].trim(),
            company_name: 'OIA · Jadarah',
            location: 'Muscat, Oman',
            job_employment_type: 'Full-time',
            description: x.snippet || '',
            job_apply_link: x.link,
            job_posted_at_datetime_utc: null,
            _source: 'Jadarah · OIA',
          }));
      } catch(e) {
        console.log('Jadarah search failed:', e.message);
        return [];
      }
    }

    // LinkedIn — direct site:linkedin.com/jobs search for guaranteed LinkedIn coverage
    async function searchLinkedIn(query) {
      const cleanQ = query.replace(/ Oman$/, '').trim();
      const params = new URLSearchParams({
        engine: 'google',
        q: `${cleanQ} ${loc} site:linkedin.com/jobs`,
        num: '10', hl: 'en', api_key: apiKey,
      });
      try {
        const r = await fetch('https://serpapi.com/search.json?' + params.toString());
        if (!r.ok) return [];
        const d = await r.json();
        return (d.organic_results || [])
          .filter(x => x.link && x.link.includes('linkedin.com/jobs'))
          .map(x => ({
            job_id: x.link,
            title: (x.title || '').replace(/\s*[-|].*$/,'').trim(),
            company_name: (x.displayed_link || '').replace('linkedin.com › jobs › view','').trim() || 'LinkedIn',
            location: loc,
            job_employment_type: 'Full-time',
            description: x.snippet || '',
            job_apply_link: x.link,
            job_posted_at_datetime_utc: null,
            _source: 'LinkedIn',
          }));
      } catch(e) {
        console.log('LinkedIn search failed:', e.message);
        return [];
      }
    }

    console.log('Searching Google Jobs + LinkedIn + Jadarah with queries:', queries);
    const mainQ = queries[0] || '';
    const batches = await Promise.all([
      ...queries.map(searchGoogle),
      searchLinkedIn(mainQ),
      searchJadarah(mainQ),
    ]);

    // Merge + deduplicate
    const seen = new Set();
    const merged = [];
    for (const batch of batches) {
      for (const j of batch) {
        const uid = (j.company_name || '') + '|' + (j.title || '');
        if (!seen.has(uid)) {
          seen.add(uid);
          merged.push(j);
        }
      }
    }
    console.log('Total merged results:', merged.length);

    function daysAgo(detected) {
      if (!detected) return null;
      const text = (detected.posted_at || '').toLowerCase();
      if (text.includes('today') || text.includes('hour'))  return 0;
      if (text.includes('yesterday'))                       return 1;
      const dayMatch = text.match(/(\d+)\s*day/);
      if (dayMatch) return parseInt(dayMatch[1]);
      const weekMatch = text.match(/(\d+)\s*week/);
      if (weekMatch) return parseInt(weekMatch[1]) * 7;
      const monthMatch = text.match(/(\d+)\s*month/);
      if (monthMatch) return parseInt(monthMatch[1]) * 30;
      return null;
    }

    function bestApplyLink(j) {
      // Pick the best apply link — prefer LinkedIn, Indeed, then any
      const opts = j.apply_options || [];
      const prefer = ['linkedin', 'indeed', 'naukrigulf', 'bayt', 'glassdoor'];
      for (const site of prefer) {
        const opt = opts.find(o => (o.link || '').toLowerCase().includes(site));
        if (opt) return opt.link;
      }
      return opts.length ? opts[0].link : '';
    }

    function sourceLabel(j) {
      // Show which platform the job was found on
      if (j._source) return j._source;
      const opts = j.apply_options || [];
      if (!opts.length) return '';
      const link = (opts[0].link || opts[0].title || '').toLowerCase();
      if (link.includes('linkedin'))   return 'LinkedIn';
      if (link.includes('indeed'))     return 'Indeed';
      if (link.includes('naukrigulf')) return 'Naukrigulf';
      if (link.includes('bayt'))       return 'Bayt';
      if (link.includes('glassdoor'))  return 'Glassdoor';
      if (link.includes('gulfjob') || link.includes('gulftalent')) return 'GulfTalent';
      if (link.includes('bebee'))      return 'BeBee';
      return opts[0].title || '';
    }

    const jobs = merged.slice(0, 12).map(j => ({
      id:         (j.job_id || '') + (j.title || ''),
      title:      j.title           || '',
      company:    j.company_name    || '',
      location:   j.location        || loc,
      type:       (j.detected_extensions && j.detected_extensions.schedule_type) || j.job_employment_type || 'Full-time',
      desc:       (j.description || j.job_description || '').slice(0, 3000),
      apply_link: j.job_apply_link || bestApplyLink(j),
      source:     j._source || sourceLabel(j),
      days_ago:   daysAgo(j.detected_extensions),
    }));

    // Increment job search counter
    try {
      const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
      if (redisUrl && redisToken) {
        await fetch(`${redisUrl}/INCR/seerah_searches`, { headers: { Authorization: `Bearer ${redisToken}` } });
      }
    } catch(e2) {}
    res.status(200).json({ jobs, queries_used: queries });

  } catch (e) {
    res.status(500).json({ error: 'Unexpected error: ' + e.message });
  }
};
