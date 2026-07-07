// /api/country.js — returns visitor's country from Vercel IP header
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  const country = req.headers['x-vercel-ip-country'] || 'Unknown';
  res.status(200).json({ country });
};
