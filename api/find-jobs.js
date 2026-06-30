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
    const { jobTitle, skills, country, education, certifications } = req.body || {};

    if (!jobTitle) {
      res.status(400).json({ error: 'jobTitle is required' });
      return;
    }

    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing RAPIDAPI_KEY' });
      return;
    }

    // Job titles can be long/specific ("Senior Project Engineer – O&M / Small
    // Capex Department"), which real job search engines often match too
    // narrowly or not at all. Strip it down to the core, more commonly-used
    // role words.
    function simplifyTitle(title) {
      return (title || '')
        .split(/[-–—/|]/)[0] // keep only the part before a dash/slash separator
        .replace(/\b(senior|junior|lead|principal|associate|chief|head of)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Pull out the likely field/major from education entries (e.g.
    // "B.Sc. Civil Engineering, Sultan Qaboos University" -> "Civil Engineering")
    function extractField(educationEntries) {
      if (!educationEntries || !educationEntries.length) return '';
      const entry = educationEntries[0];
      const match = entry.match(/(?:in|of)\s+([A-Za-z &]+?)(?:,|$)/i);
      if (match) return match[1].trim();
      // fallback: strip common degree prefixes, take what's left before a comma
      return entry
        .replace(/\b(b\.?sc\.?|m\.?sc\.?|bachelor'?s?|master'?s?|diploma|phd|degree)\b/gi, '')
        .split(',')[0]
        .trim();
    }

    const countryCode = COUNTRY_CODES[country] || '';
    const coreTitle = simplifyTitle(jobTitle) || jobTitle;
    const topSkills = (skills || []).slice(0, 3).join(' ');
    const field = extractField(education);
    const topCert = (certifications || [])[0] || '';

    // Full query: role + skills + field/major + a certification, so the
    // search reflects the whole candidate profile, not just their exact
    // current job title.
    const fullQueryParts = [coreTitle, topSkills, field, topCert, 'jobs in', country || ''].filter(Boolean);
    const query = fullQueryParts.join(' ').trim();

    async function searchJobs(searchQuery) {
      const params = new URLSearchParams({
        query: searchQuery,
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
        throw new Error(`Job search request failed: ${errText}`);
      }

      const data = await response.json();
      return (data.data && data.data.jobs) || data.data || [];
    }

    let jobList = await searchJobs(query);

    // If the narrower search found nothing, broaden further: skills + field
    // only, dropping the specific title entirely.
    if (jobList.length === 0 && topSkills) {
      const broaderQuery = `${topSkills} jobs in ${country || ''}`.trim();
      jobList = await searchJobs(broaderQuery);
    }

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
