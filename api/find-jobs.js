// /api/find-jobs.js
// Searches live job postings (via the JSearch API, which aggregates Google
// for Jobs / LinkedIn / Indeed / Bayt / Glassdoor etc.) for openings that
// match the candidate's most relevant role + skills, filtered by country.

const COUNTRY_CODES = {
  Oman: 'om',
  UAE: 'ae',
  'Saudi Arabia': 'sa',
  Qatar: 'qa',
  Bahrain: 'bh',
  Kuwait: 'kw',
  'United Kingdom': 'gb',
  'United States': 'us',
  Canada: 'ca',
  Australia: 'au',
  Germany: 'de',
  India: 'in',
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
    const topSkills = (skills || []).slice(0, 2).join(' ');
    const query = `${jobTitle} ${topSkills} in ${country || ''}`.trim();

    const params = new URLSearchParams({
      query,
      page: '1',
      num_pages: '1',
      ...(countryCode ? { country: countryCode } : {}),
    });

    const response = await fetch(`https://jsearch.p.rapidapi.com/search-v2?${params.toString()}`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: 'Job search request failed', detail: errText });
      return;
    }

    const data = await response.json();
    const jobList = (data.data && data.data.jobs) || data.data || [];
    const jobs = jobList.slice(0, 8).map((j) => ({
      title: j.job_title,
      company: j.employer_name,
      location: [j.job_city, j.job_country].filter(Boolean).join(', ') || j.job_location || country,
      apply_link: j.job_apply_link,
      employment_type: j.job_employment_type,
      posted: j.job_posted_at_datetime_utc,
    }));

    res.status(200).json({ jobs });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', detail: err.message });
  }
};
