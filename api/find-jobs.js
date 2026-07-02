// /api/find-jobs.js — Seerah AI
// Simplified — one clean query, errors exposed (no silent failures)

const COUNTRY_CODES = {
  Oman:'om', UAE:'ae', 'Saudi Arabia':'sa',
  Qatar:'qa', Bahrain:'bh', Kuwait:'kw',
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const { jobTitle, country } = req.body || {};
  if (!jobTitle) { res.status(400).json({ error: 'jobTitle required' }); return; }
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) { res.status(500).json({ error: 'RAPIDAPI_KEY is not set in Vercel environment variables' }); return; }

  try {
    // Simplest possible query — just like Google: "engineer Oman"
    const core = jobTitle
      .replace(/\b(senior|sr\.?|lead|principal|chief|head of|junior|jr\.?|associate)\b/gi, '')
      .replace(/\s+/g, ' ').trim();

    const query = `${core} ${country || 'Oman'}`.trim();

    const params = new URLSearchParams({ query, page: '1', num_pages: '1' });

    const response = await fetch(
      `https://jsearch.p.rapidapi.com/search-v2?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key':  apiKey,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
      }
    );

    const responseText = await response.text();

    // Expose the real API error — no more silent failures
    if (!response.ok) {
      const status = response.status;
      let detail = responseText;
      try { detail = JSON.parse(responseText); } catch(e) {}

      if (status === 429) {
        res.status(429).json({ error: 'RapidAPI quota exceeded. Check your plan at rapidapi.com/dashboard', status, detail });
      } else if (status === 403) {
        res.status(403).json({ error: 'RapidAPI key invalid or not subscribed to JSearch. Check at rapidapi.com', status, detail });
      } else {
        res.status(status).json({ error: `JSearch API error ${status}`, detail });
      }
      return;
    }

    const data = JSON.parse(responseText);
    const raw = (data.data && data.data.jobs) || data.data || [];

    function daysAgo(iso) {
      if (!iso) return null;
      return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
    }

    const jobs = raw.slice(0, 10).map(j => ({
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
    res.status(500).json({ error: 'Unexpected error: ' + e.message });
  }
};
