// /api/checkout-word.js
// POST  → creates a Stripe checkout session and returns the URL
// GET   → Stripe redirects here after payment; generates and serves the .docx

const PRICE_USD_CENTS = 399; // $3.99

// ── tiny in-memory store mapping session_id → cv data ────────────────────
// For a production app, persist this in a database (Supabase, Redis, etc.)
// For MVP purposes, Vercel's serverless functions keep process memory alive
// for a few minutes, which is long enough for the checkout → download flow.
const sessionStore = {};

module.exports = async function handler(req, res) {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  // ── POST: create checkout session ──────────────────────────────────────
  if (req.method === 'POST') {
    const { cv, name } = req.body || {};

    if (!cv) {
      res.status(400).json({ error: 'No CV data provided' });
      return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ||
      `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: PRICE_USD_CENTS,
            product_data: {
              name: 'CV Match AI — Word Download',
              description: 'Download your tailored CV as a professionally formatted .docx file.',
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/api/checkout-word?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}`,
    });

    // Store the CV data against this session id
    sessionStore[session.id] = { cv, name: name || 'Candidate' };

    res.status(200).json({ url: session.url });
    return;
  }

  // ── GET: Stripe redirect after payment — generate and serve the .docx ──
  if (req.method === 'GET') {
    const sessionId = req.query.session_id;
    if (!sessionId) {
      res.status(400).send('Missing session_id');
      return;
    }

    // Verify payment succeeded
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      res.status(402).send('Payment not completed.');
      return;
    }

    const stored = sessionStore[sessionId];
    if (!stored) {
      res.status(410).send(
        'This download link has expired (server restarted). ' +
        'Please go back to the site to generate your CV again.'
      );
      return;
    }

    const { cv, name } = stored;
    delete sessionStore[sessionId]; // one-time use

    // Generate docx
    const docxBuffer = await buildDocx(cv, name);

    const safeName = (name || 'CV').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_CV.docx"`);
    res.send(Buffer.from(docxBuffer));
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};

// ── Build docx in memory using docx npm package ──────────────────────────
async function buildDocx(cv, candidateName) {
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel,
    AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType,
  } = require('docx');

  const nameRun = new TextRun({
    text: candidateName,
    bold: true,
    size: 52,   // 26pt
    font: 'Calibri',
  });

  const titleRun = cv.experience && cv.experience[0]
    ? new TextRun({
        text: (cv.experience[0].title || '').split(/[-–—/|]/)[0].trim(),
        color: '2F5496',
        size: 26,
        font: 'Calibri',
        break: 1,
      })
    : null;

  function sectionHeading(text) {
    return new Paragraph({
      text: text.toUpperCase(),
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 80 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '2F5496' },
      },
      run: { color: '2F5496', size: 22, font: 'Calibri', bold: true },
    });
  }

  function bodyPara(text, options = {}) {
    return new Paragraph({
      children: [
        new TextRun({
          text,
          size: 22,
          font: 'Calibri',
          ...options,
        }),
      ],
      spacing: { after: 60 },
    });
  }

  function bulletPara(text) {
    return new Paragraph({
      text,
      bullet: { level: 0 },
      spacing: { after: 40 },
      run: { size: 22, font: 'Calibri' },
    });
  }

  const children = [];

  // Header
  children.push(new Paragraph({
    children: [nameRun, ...(titleRun ? [titleRun] : [])],
    alignment: AlignmentType.LEFT,
    spacing: { after: 120 },
  }));

  // Summary
  if (cv.professional_summary) {
    children.push(sectionHeading('Professional Summary'));
    children.push(bodyPara(cv.professional_summary));
  }

  // Skills
  if (cv.skills && cv.skills.length) {
    children.push(sectionHeading('Skills'));
    children.push(bodyPara(cv.skills.join('  ·  ')));
  }

  // Experience
  if (cv.experience && cv.experience.length) {
    children.push(sectionHeading('Experience'));
    cv.experience.forEach(role => {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${role.title || ''} — ${role.company || ''}`, bold: true, size: 24, font: 'Calibri' }),
        ],
        spacing: { before: 120, after: 40 },
      }));
      if (role.dates) {
        children.push(bodyPara(role.dates, { color: '666666', italics: true }));
      }
      (role.bullets || []).forEach(b => children.push(bulletPara(b)));
    });
  }

  // Education
  if (cv.education && cv.education.length) {
    children.push(sectionHeading('Education'));
    cv.education.forEach(e => children.push(bodyPara(e)));
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading2',
          name: 'Heading 2',
          run: { bold: true, color: '2F5496', size: 22, font: 'Calibri' },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
