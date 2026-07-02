// /api/find-jobs.js — Seerah AI
// Original working approach: /search endpoint, simple query, country code param.

const COUNTRY_CODES = {
  Oman: 'om', UAE: 'ae', 'Saudi Arabia': 'sa',
  Qatar: 'qa', Bahrain: 'bh', Kuwait: 'kw',
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { jobTitle, skills, country } = req.body || {};
  if (!jobTitle) { res.status(400).json({ error: 'jobTitle required' }); return; }

  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Missing RAPIDAPI_KEY' }); return; }

  try {
    const countryCode = COUNTRY_CODES[country] || '';
    const topSkills   = (Array.isArray(skills) ? skills : []).slice(0, 3).join(' ');
    const query       = [jobTitle, topSkills, country ? `in ${country}` : '']
                          .filter(Boolean).join(' ').trim();

    const params = new URLSearchParams({
      query,
      page:        '1',
      num_pages:   '1',
      date_posted: 'month',
      ...(countryCode ? { country: countryCode } : {}),
    });

    const response = await fetch(
      `https://jsearch.p.rapidapi.com/search?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key':  apiKey,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
      }
    );

    if (!response.ok) {
      const err = await response.text();
      res.status(502).json({ error: 'Job search failed', detail: err });
      return;
    }

    const data = await response.json();
    const raw  = data.data || [];

    function daysAgo(iso) {
      if (!iso) return null;
      return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
    }

    const jobs = raw.slice(0, 8).map(j => ({
      id:         j.job_id || '',
      title:      j.job_title           || '',
      company:    j.employer_name       || '',
      location:   [j.job_city, j.job_country].filter(Boolean).join(', ') || country || '',
      type:       j.job_employment_type || 'Full-time',
      desc:       (j.job_description   || '').slice(0, 3000),
      apply_link: j.job_apply_link     || j.job_google_link || '',
      days_ago:   daysAgo(j.job_posted_at_datetime_utc),
    }));

    res.status(200).json({ jobs, query_used: query });
  } catch (e) {
    res.status(500).json({ error: 'Unexpected error', detail: e.message });
  }
};
