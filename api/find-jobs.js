// /api/find-jobs.js — Seerah AI
// Lesson learned: simple broad queries find more relevant jobs.
// Google finds "Project Engineer Oman" with "engineering jobs oman".
// We do the same: strip to core field + country, run 2 queries in parallel,
// let the frontend calcMatch handle relevance ranking.

const COUNTRY_CODES = {
  Oman:'om', UAE:'ae', 'Saudi Arabia':'sa',
  Qatar:'qa', Bahrain:'bh', Kuwait:'kw',
};

// Strip seniority words to get a broader, more commonly posted title
function coreTitle(t) {
  return (t || '')
    .replace(/\b(senior|sr\.?|lead|principal|chief|head of|junior|jr\.?|associate)\b/gi, '')
    .replace(/\s+/g, ' ').trim();
}

// Derive the engineering field from the title for a Google-style broad query
function fieldQuery(title, educationField) {
  const t = (title + ' ' + (educationField || '')).toLowerCase();
  if (t.includes('civil') || t.includes('water') || t.includes('structural') || t.includes('infrastructure')) return 'civil engineer';
  if (t.includes('mechanical')) return 'mechanical engineer';
  if (t.includes('electrical')) return 'electrical engineer';
  if (t.includes('process') || t.includes('chemical')) return 'process engineer';
  if (t.includes('project') || t.includes('construction') || t.includes('site')) return 'project engineer';
  if (t.includes('instrument')) return 'instrumentation engineer';
  return coreTitle(title) || 'engineer';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { jobTitle, skills, country, educationField } = req.body || {};
  if (!jobTitle) { res.status(400).json({ error: 'jobTitle required' }); return; }

  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Missing RAPIDAPI_KEY' }); return; }

  try {
    const countryCode = COUNTRY_CODES[country] || '';
    const field = fieldQuery(jobTitle, educationField);
    const core  = coreTitle(jobTitle);

    // Two simple queries — broad like Google, not over-specified
    const queries = [...new Set([
      `${core} ${country || ''}`.trim(),          // e.g. "Project Engineer Oman"
      `${field} jobs ${country || ''}`.trim(),    // e.g. "civil engineer jobs Oman"
    ])].filter(Boolean);

    async function search(query) {
      const params = new URLSearchParams({
        query,
        page:      '1',
        num_pages: '2',          // get more results per query
        // no date_posted filter — Oman market posts less frequently
        ...(countryCode ? { country: countryCode } : {}),
      });
      try {
        const r = await fetch(
          `https://jsearch.p.rapidapi.com/search?${params.toString()}`,
          {
            method: 'GET',
            headers: {
              'X-RapidAPI-Key':  apiKey,
              'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
            },
          }
        );
        if (!r.ok) return [];
        const d = await r.json();
        return d.data || [];
      } catch (e) {
        return [];
      }
    }

    // Run both queries in parallel
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
    res.status(500).json({ error: 'Search failed', detail: e.message });
  }
};
