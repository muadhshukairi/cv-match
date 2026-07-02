// /api/find-jobs.js — Seerah AI
// Original search method: simple query + country code param on /search endpoint.
// This was working better than the progressive /search-v2 approach.

const COUNTRY_CODES = {
  Oman: 'om', UAE: 'ae', 'Saudi Arabia': 'sa',
  Qatar: 'qa', Bahrain: 'bh', Kuwait: 'kw',
  'United Kingdom': 'gb', 'United States': 'us',
  Canada: 'ca', Australia: 'au', Germany: 'de', India: 'in',
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

    const countryCode = COUNTRY_CODES[country] || '';
    const topSkills   = (Array.isArray(skills) ? skills : []).slice(0, 2).join(' ');

    // Original simple query that worked: title + skills + "in country"
    const query = [jobTitle, topSkills, country ? `in ${country}` : '']
      .filter(Boolean).join(' ').trim();

    const params = new URLSearchParams({
      query,
      page:      '1',
      num_pages: '1',
      date_posted: 'month',   // only jobs from the last 30 days
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
      const errText = await response.text();
      res.status(502).json({ error: 'Job search failed', detail: errText });
      return;
    }

    const data = await response.json();
    const raw  = data.data || [];

    function daysAgo(iso) {
      if (!iso) return null;
      return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
    }

    const jobs = raw.slice(0, 8).map((j) => ({
      id:          j.job_id || '',
      title:       j.job_title            || '',
      company:     j.employer_name        || '',
      location:    [j.job_city, j.job_country].filter(Boolean).join(', ') || country || '',
      type:        j.job_employment_type  || 'Full-time',
      desc:        (j.job_description     || '').slice(0, 3000),
      apply_link:  j.job_apply_link       || j.job_google_link || '',
      posted_at:   j.job_posted_at_datetime_utc || null,
      days_ago:    daysAgo(j.job_posted_at_datetime_utc),
    }));

    res.status(200).json({ jobs, query_used: query });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', detail: err.message });
  }
};
