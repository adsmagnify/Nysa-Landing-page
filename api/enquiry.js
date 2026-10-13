const nodemailer = require('nodemailer');

const COURSES = [
  'Medical Lab Technology',
  'Radiology & Imaging',
  'Operation Theatre Technology',
  'Physiotherapy',
  'Pharmacy'
];

const CAMPUSES = ['Mumbai', 'Pune', 'Nashik', 'Nagpur', 'Jalgaon', 'Latur', 'Kolhapur'];

function text(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function escapeHtml(value) {
  return text(value, 500)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (err) {
      body = {};
    }
  }
  body = body || {};

  if (text(body._honey, 200)) {
    res.status(200).json({ ok: true });
    return;
  }

  const name = text(body.name, 120);
  const phone = text(body.phone, 20);
  const course = text(body.course, 80);
  const campus = text(body.campus, 40);
  const digits = phone.replace(/\D/g, '');

  if (name.length < 2 || digits.length < 10 || digits.length > 15 || COURSES.indexOf(course) === -1 || CAMPUSES.indexOf(campus) === -1) {
    res.status(400).json({ ok: false });
    return;
  }

  const user = process.env.SMTP_USER;
  const pass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const to = process.env.MAIL_TO || user;
  if (!user || !pass || !to) {
    res.status(500).json({ ok: false });
    return;
  }

  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: port,
    secure: port === 465,
    auth: { user: user, pass: pass }
  });

  try {
    await transporter.sendMail({
      from: 'NYSA School of Healthcare <' + user + '>',
      to: to,
      subject: 'NYSA admissions enquiry — ' + name,
      text: [
        'New admissions enquiry',
        '',
        'Name: ' + name,
        'Mobile: ' + phone,
        'Course: ' + course,
        'Campus: ' + campus
      ].join('\n'),
      html: [
        '<h2 style="font-family:Arial,sans-serif;color:#1A2744">New admissions enquiry</h2>',
        '<p style="font-family:Arial,sans-serif;font-size:16px;color:#292929"><strong>Name:</strong> ' + escapeHtml(name) + '</p>',
        '<p style="font-family:Arial,sans-serif;font-size:16px;color:#292929"><strong>Mobile:</strong> ' + escapeHtml(phone) + '</p>',
        '<p style="font-family:Arial,sans-serif;font-size:16px;color:#292929"><strong>Course:</strong> ' + escapeHtml(course) + '</p>',
        '<p style="font-family:Arial,sans-serif;font-size:16px;color:#292929"><strong>Campus:</strong> ' + escapeHtml(campus) + '</p>'
      ].join('')
    });
  } catch (err) {
    console.error('enquiry mail failed');
    res.status(502).json({ ok: false });
    return;
  }

  res.status(200).json({ ok: true });
};
