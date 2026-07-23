// /api/checkout-word.js — Seerah AI
// Free .docx download — no payment required. Previously this file ran a
// Stripe checkout flow; that's been removed and replaced with a direct,
// free download to stay within Vercel's Hobby-plan function limit.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { cv, name, contact, templateId } = req.body || {};
    if (!cv) {
      res.status(400).json({ error: 'No CV data provided' });
      return;
    }

    const docxBuffer = await buildDocx(cv, name || 'Candidate', contact || '', templateId || 'executive');

    const safeName = (name || 'CV').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_') || 'CV';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_CV.docx"`);
    res.status(200).send(Buffer.from(docxBuffer));
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate Word document', detail: err.message });
  }
};

// ── Build docx in memory using the docx npm package ───────────────────────
async function buildDocx(cv, candidateName, contact, templateId) {
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel,
    AlignmentType, BorderStyle,
  } = require('docx');

  // Same accent-color mapping as the on-site template picker (stColor in
  // index.html), EXCEPT for templates whose site color is so dark (near-
  // black) it reads as "no color at all" in a plain Word document — those
  // get a brighter Word-specific equivalent so the template is actually
  // visually distinguishable on the page, not just technically correct.
  const templateColors = {
    executive: '1E3A8A', // site is 0F1F4B (near-black navy) — brightened for Word
    zurich: 'C0392B', ember: 'B05E3A', slate: '0EA5E9',
    pearl: '374151',     // site is 111111 (near-black) — brightened for Word
    aurora: '2C5364', onyx: '15803D', // site is 4ADE80, but that light green fails contrast on white paper — darkened
    sand: '8B5E3C', prism: '7C3AED', titanium: '52525B',
  };
  const accent = templateColors[templateId] || templateColors.executive;

  const nameRun = new TextRun({
    text: candidateName,
    bold: true,
    size: 52,   // 26pt
    font: 'Calibri',
  });

  const titleRun = cv.experience && cv.experience[0]
    ? new TextRun({
        text: (cv.experience[0].title || '').split(/[-–—/|]/)[0].trim(),
        color: accent,
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
        bottom: { style: BorderStyle.SINGLE, size: 6, color: accent },
      },
      run: { color: accent, size: 22, font: 'Calibri', bold: true },
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
    spacing: { after: contact ? 40 : 80 },
  }));

  // Contact info (location / email / phone) — previously never sent to this
  // endpoint at all, so it silently never appeared in the downloaded file.
  if (contact) {
    children.push(new Paragraph({
      children: [new TextRun({ text: contact, size: 19, color: '666666', font: 'Calibri' })],
      spacing: { after: 100 },
    }));
  }

  // Colored rule under the header — makes the template's accent color
  // unmistakably visible even before you reach the first section heading,
  // rather than relying solely on heading-text color to convey it.
  children.push(new Paragraph({
    children: [new TextRun({ text: '', size: 2 })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 16, color: accent } },
    spacing: { after: 160 },
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
          run: { bold: true, color: accent, size: 22, font: 'Calibri' },
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
