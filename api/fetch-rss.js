// /api/fetch-rss.js — Seerah AI
// Fetches the RSS.app feed for @kazi.oman, returns recent posts with image URLs

const RSS_URL = 'https://rss.app/feeds/EPEieyFsTxHWq8Ri.xml';
const MAX_DAYS = 14; // only posts from last 14 days

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const r = await fetch(RSS_URL, {
      headers: { 'User-Agent': 'SeerahAI/1.0 RSS Reader' }
    });
    if (!r.ok) {
      res.status(502).json({ error: 'RSS fetch failed: ' + r.status });
      return;
    }

    const xml = await r.text();

    // Parse items from RSS XML
    const items = [];
    const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    const cutoff = Date.now() - MAX_DAYS * 24 * 60 * 60 * 1000;

    for (const item of itemMatches) {
      // Extract fields
      const title    = (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                        item.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
      const link     = (item.match(/<link>([\s\S]*?)<\/link>/)                  || [])[1] || '';
      const pubDate  = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)            || [])[1] || '';
      const desc     = (item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                        item.match(/<description>([\s\S]*?)<\/description>/)    || [])[1] || '';

      // Check date — skip posts older than 14 days
      const postDate = pubDate ? new Date(pubDate).getTime() : Date.now();
      if (postDate < cutoff) continue;

      // Extract image URL — try enclosure first, then img tag in description
      let imageUrl = '';
      const enclosure = item.match(/enclosure[^>]*url="([^"]+)"/);
      if (enclosure) {
        imageUrl = enclosure[1];
      } else {
        const imgTag = desc.match(/<img[^>]*src="([^"]+)"/);
        if (imgTag) imageUrl = imgTag[1];
      }

      // Caption text — strip HTML from description
      const caption = desc.replace(/<[^>]+>/g, '').trim().slice(0, 500);

      if (!imageUrl && !caption) continue;

      items.push({
        title:    title.slice(0, 200),
        caption:  caption,
        imageUrl: imageUrl,
        link:     link.trim(),
        pubDate:  pubDate,
        daysAgo:  Math.floor((Date.now() - postDate) / 86400000),
      });
    }

    res.status(200).json({ posts: items, total: items.length, source: '@kazi.oman' });

  } catch(e) {
    res.status(500).json({ error: 'Error: ' + e.message });
  }
};
