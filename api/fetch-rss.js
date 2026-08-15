// /api/fetch-rss.js — Seerah AI Daily Job Auto-Scanner
//
// Multi-action endpoint (keeps this at ONE serverless function instead of several,
// to stay within Vercel's Hobby-plan 12-function limit):
//
//   GET  ?action=scan     — triggered daily by Vercel Cron. Scans each monitored
//                           Instagram account's RSS.app feed for NEW posts, extracts
//                           job listings via Claude Vision + real QR decoding is done
//                           client-side later (same as manual upload flow), and stores
//                           results as PENDING — nothing is published automatically.
//   GET  ?action=list     — returns all pending items for the admin review queue.
//   POST ?action=approve  — publishes one pending item to the Google Sheet (same
//                           publish flow as manual admin uploads), removes it from pending.
//   POST ?action=reject   — discards one pending item without publishing.
//
// Nothing here ever auto-publishes. Every extracted job sits in a pending queue
// until a human approves it in jobs-admin.html.

// ── Configure the Instagram accounts to monitor ──
// Add one entry per account. Each needs an RSS.app feed — create one free/paid feed
// per account at rss.app, then paste its feed ID here.
const MONITORED_FEEDS = [
  { name: '@kazi.oman', feedId: 'zINswNdKdoi9lfCF' },
  { name: '@omancareers', feedId: 'kK0iwPJU8qtqgxjT' },
  { name: '@careers__oman', feedId: 'NeLgmRkVnzsOmSTw' },
  { name: '@omanhsecareers', feedId: 'BHokj8GSJA7gil5r' },
];

const MAX_DAYS = 1; // only scan posts from the last N days per run
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzo9yLuujndd1KKl1hQ-yd8Av_GgL7yJ_8m_IcZycsr1nMe9BTfO2ZqYQgCqiKjMFzV/exec';

// ── Duplicate detection by actual job content, not just source post ────────
// The same ad often gets reposted across multiple monitored accounts, or a
// job may already have been published manually before. Match on normalized
// title + company so those get caught regardless of which post they came from.
function jobFingerprint(title, company) {
  return (title || '').toLowerCase().trim().replace(/\s+/g, ' ') + '|' + (company || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

async function getPublishedFingerprints() {
  const set = new Set();
  try {
    const r = await fetch(SHEETS_URL + '?action=getJobs');
    const jobs = await r.json();
    (Array.isArray(jobs) ? jobs : []).forEach(function (j) {
      set.add(jobFingerprint(j.title_en, j.company));
    });
  } catch (e) { /* if this fails, we just skip published-dedup for this run rather than blocking the scan */ }
  return set;
}

async function getPendingFingerprints() {
  const set = new Set();
  try {
    const raw = await redisCmd(['HGETALL', 'pending_jobs']);
    if (Array.isArray(raw)) {
      for (let i = 0; i < raw.length; i += 2) {
        try {
          const job = JSON.parse(raw[i + 1]);
          set.add(jobFingerprint(job.title_en, job.company));
        } catch (e) { /* skip malformed entry */ }
      }
    }
  } catch (e) { /* non-fatal */ }
  return set;
}

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || '').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const IMGBB_KEY = process.env.IMGBB_API_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const action = (req.query && req.query.action) || (req.body && req.body.action) || 'scan';

  try {
    if (action === 'scan') return await handleScan(req, res);
    if (action === 'list') return await handleList(req, res);
    if (action === 'approve') return await handleApprove(req, res);
    if (action === 'reject') return await handleReject(req, res);
    res.status(400).json({ error: 'Unknown action: ' + action });
  } catch (e) {
    res.status(500).json({ error: 'Unexpected error: ' + e.message });
  }
};

// ── Redis (Upstash REST API) ──────────────────────────────────────────────
async function redisCmd(args) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('Redis is not configured (missing UPSTASH env vars)');
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const d = await r.json();
  if (d.error) throw new Error('Redis error: ' + d.error);
  return d.result;
}

// ── action: scan ────────────────────────────────────────────────────────
async function handleScan(req, res) {
  if (!ANTHROPIC_KEY) { res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' }); return; }

  const debug = (req.query && req.query.debug === '1');
  const results = { feedsScanned: 0, postsFound: 0, newPosts: 0, jobsExtracted: 0, duplicatesSkipped: 0, errors: [] };
  if (debug) results.debugPosts = [];
  const cutoff = Date.now() - MAX_DAYS * 24 * 60 * 60 * 1000;

  // Build dedup sets once up front — checked against on every extracted job below.
  const publishedFp = await getPublishedFingerprints();
  const pendingFp = await getPendingFingerprints();

  for (const feed of MONITORED_FEEDS) {
    if (!feed.feedId || feed.feedId.indexOf('PASTE_') === 0) {
      results.errors.push(feed.name + ': skipped — no real feed ID configured yet');
      continue;
    }
    results.feedsScanned++;
    let posts = [];
    try {
      posts = await fetchFeedPosts(feed.feedId);
    } catch (e) {
      results.errors.push(feed.name + ': feed fetch failed — ' + e.message);
      continue;
    }
    results.postsFound += posts.length;

    for (const post of posts) {
      let debugEntry = null;
      if (debug) {
        debugEntry = {
          feed: feed.name, link: post.link, hasImage: !!post.imageUrl,
          pubDate: post.pubDate || '(none)', pubDateMs: post.pubDateMs || null,
          ageDays: post.pubDateMs ? Math.round((Date.now() - post.pubDateMs) / 86400000 * 10) / 10 : null,
        };
        results.debugPosts.push(debugEntry);
      }

      if (!post.imageUrl || !post.link) { if (debugEntry) debugEntry.skipped = 'no image or link'; continue; }
      if (post.pubDateMs && post.pubDateMs < cutoff) { if (debugEntry) debugEntry.skipped = 'older than MAX_DAYS'; continue; }

      let alreadySeen;
      try {
        alreadySeen = await redisCmd(['GET', 'seen_post:' + post.link]);
      } catch (e) {
        results.errors.push('Redis check failed for ' + post.link + ': ' + e.message);
        if (debugEntry) debugEntry.skipped = 'redis check error';
        continue;
      }
      if (alreadySeen) { if (debugEntry) debugEntry.skipped = 'already marked seen'; continue; }

      results.newPosts++;

      // Upload to permanent storage ONCE per post (not per job extracted from it) —
      // Instagram's own CDN links are often short-lived/hotlink-protected, so by
      // the time this gets reviewed later, the raw link may already be dead.
      let permanentImageUrl = post.imageUrl;
      if (IMGBB_KEY) {
        try {
          permanentImageUrl = await uploadToImgBB(post.imageUrl);
        } catch (e) { /* fall back to the original link rather than failing the whole post */ }
      }

      try {
        const jobs = await extractJobsFromImage(post.imageUrl);
        for (const job of jobs) {
          const fp = jobFingerprint(job.title_en, job.company);
          if (publishedFp.has(fp)) {
            results.duplicatesSkipped++;
            if (debugEntry) debugEntry.skipped = 'duplicate of already-published job';
            continue;
          }
          if (pendingFp.has(fp)) {
            results.duplicatesSkipped++;
            if (debugEntry) debugEntry.skipped = 'duplicate of already-pending job';
            continue;
          }
          pendingFp.add(fp); // catch duplicates within this same run too (e.g. two accounts posting the same ad)

          const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          const record = Object.assign({}, job, {
            id: id,
            source_account: feed.name,
            post_link: post.link,
            caption: (post.caption || '').slice(0, 500),
            image_url: permanentImageUrl,
            scanned_at: new Date().toISOString(),
          });
          await redisCmd(['HSET', 'pending_jobs', id, JSON.stringify(record)]);
          results.jobsExtracted++;
        }
      } catch (e) {
        results.errors.push('Extraction failed for ' + post.link + ': ' + e.message);
      }

      // Mark as seen regardless of extraction outcome, so a bad image doesn't get
      // retried forever on every future scan. 30-day expiry keeps the seen-set from
      // growing unbounded.
      try {
        await redisCmd(['SET', 'seen_post:' + post.link, '1', 'EX', String(60 * 60 * 24 * 30)]);
      } catch (e) { /* non-fatal */ }
    }
  }

  res.status(200).json(results);
}

// ── action: list ────────────────────────────────────────────────────────
async function handleList(req, res) {
  let raw;
  try {
    raw = await redisCmd(['HGETALL', 'pending_jobs']);
  } catch (e) {
    res.status(500).json({ error: 'Could not read pending queue', detail: e.message });
    return;
  }
  // Upstash HGETALL returns a flat array: [field1, value1, field2, value2, ...]
  const jobs = [];
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) {
      try { jobs.push(JSON.parse(raw[i + 1])); } catch (e) { /* skip malformed entry */ }
    }
  }
  jobs.sort(function (a, b) { return (b.scanned_at || '').localeCompare(a.scanned_at || ''); });
  res.status(200).json({ jobs: jobs });
}

// ── action: approve ─────────────────────────────────────────────────────
// ── Upload an image URL to permanent ImgBB storage ────────────────────────
async function uploadToImgBB(sourceUrl) {
  const imgRes = await fetch(sourceUrl);
  if (!imgRes.ok) throw new Error('Could not download source image: HTTP ' + imgRes.status);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const base64 = buf.toString('base64');
  const form = new URLSearchParams();
  form.append('image', base64);
  form.append('name', 'seerah-autoscan-' + Date.now());
  const up = await fetch('https://api.imgbb.com/1/upload?key=' + IMGBB_KEY, { method: 'POST', body: form });
  const upData = await up.json();
  if (!upData.success) throw new Error('ImgBB upload failed');
  return upData.data.display_url || upData.data.url;
}

async function handleApprove(req, res) {
  const job = req.body || {};
  if (!job.id) { res.status(400).json({ error: 'id is required' }); return; }

  // job.image_url is already an ImgBB-hosted permanent link from scan time
  // (uploaded once when the post was first found) — no need to re-upload here.
  const imageUrl = job.image_url || '';

  try {
    const r = await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'publishJob',
        title_en: job.title_en || '',
        title_ar: job.title_ar || '',
        company: job.company || '',
        location: job.location || 'Oman',
        type: job.type || 'Full-time',
        deadline: job.deadline || '',
        requirements: job.requirements || [],
        contact: job.contact || '',
        source: 'Instagram (auto-scanned · ' + (job.source_account || '') + ')',
        omani_only: job.omani_only || false,
        image_thumb: imageUrl,
      }),
    });
    const d = await r.json();
    await redisCmd(['HDEL', 'pending_jobs', job.id]);
    res.status(200).json(d);
  } catch (e) {
    res.status(500).json({ error: 'Publish failed', detail: e.message });
  }
}

// ── action: reject ──────────────────────────────────────────────────────
async function handleReject(req, res) {
  const { id } = req.body || {};
  if (!id) { res.status(400).json({ error: 'id is required' }); return; }
  try {
    await redisCmd(['HDEL', 'pending_jobs', id]);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Reject failed', detail: e.message });
  }
}

// ── RSS.app feed fetching ───────────────────────────────────────────────
async function fetchFeedPosts(feedId) {
  const urls = [
    'https://rss.app/feeds/' + feedId + '.xml',
    'https://rss.app/feeds/v1.1/' + feedId + '.xml',
    'https://rss.app/feeds/v1.2/' + feedId + '.xml',
  ];

  let xml = null;
  let lastErr = null;
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'SeerahAI/1.0 RSS Reader' } });
      if (r.ok) { xml = await r.text(); break; }
      lastErr = new Error('HTTP ' + r.status);
    } catch (e) { lastErr = e; }
  }
  if (!xml) throw lastErr || new Error('All feed URL formats failed');

  const posts = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

  for (const item of itemMatches) {
    const title = (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    const desc = (item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || item.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '';

    let imageUrl = '';
    const enclosure = item.match(/enclosure[^>]*url="([^"]+)"/);
    if (enclosure) {
      imageUrl = enclosure[1];
    } else {
      const imgTag = desc.match(/<img[^>]*src="([^"]+)"/);
      if (imgTag) imageUrl = imgTag[1];
    }

    const caption = desc.replace(/<[^>]+>/g, '').trim().slice(0, 500);
    if (!imageUrl && !caption) continue;

    posts.push({
      title: title.slice(0, 200),
      caption: caption,
      imageUrl: imageUrl,
      link: link.trim(),
      pubDate: pubDate,
      pubDateMs: pubDate ? new Date(pubDate).getTime() : Date.now(),
    });
  }
  return posts;
}

// ── Claude Vision job extraction (same logic as read-job-image.js) ─────
async function extractJobsFromImage(imageUrl) {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error('Could not download image: HTTP ' + imgRes.status);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const base64 = buf.toString('base64');
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

  const prompt = `You are a job listing extractor. Read this image carefully — it may contain one or multiple Instagram job posts.

CRITICAL — only extract genuine, currently-open JOB VACANCIES someone can apply for right now. Do NOT extract:
- Training programs, bridging/transitional academic programs, or scholarships (even if they mention "registration" or have a deadline)
- Course announcements, workshops, webinars, or educational program admissions
- General career-advice, motivational, or "coming soon" / "stay tuned" posts with no actual role attached
- Company announcements, awards, or news that don't include an open position
If the post is any of the above rather than an actual job opening, return an empty array for it — do not force it into a job listing.

For EACH genuine job listing you find, return:
- title_en: English job title
- title_ar: Arabic job title
- company: company name
- location: city/country (default "Oman" if not specified)
- type: Full-time / Part-time / Internship / Contract
- deadline: application deadline if mentioned, null if not
- requirements: array of requirement strings
- contact: email, phone, WhatsApp number, or website
- omani_only: true if post says Omani nationals only, else false
- qr_url: if a QR code is visible, decode it and return the URL. Return null if none or unreadable.

Return ONLY valid JSON array, no fences:
[{"title_en":"...","title_ar":"...","company":"...","location":"...","type":"Full-time","deadline":null,"requirements":[],"contact":"...","omani_only":false,"qr_url":null}]

If no genuine job vacancies found, return: []`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: contentType, data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('AI request failed: ' + errText.slice(0, 300));
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((c) => c.type === 'text');
  const raw = textBlock ? textBlock.text : '[]';
  const clean = raw.replace(/```(?:json)?|```/gi, '').trim();
  const jobs = JSON.parse(clean);
  return Array.isArray(jobs) ? jobs : [];
}
