const crypto = require('crypto');
const nodemailer = require('nodemailer');

const COURSES = [
  'Medical Lab Technology',
  'Radiology & Imaging',
  'Operation Theatre Technology',
  'Physiotherapy',
  'Pharmacy'
];

const AREAS = [
  'Borivali / Kandivali / Dahisar',
  'Malad / Goregaon',
  'Andheri / Jogeshwari',
  'Mira Road / Bhayander',
  'Vasai / Virar',
  'Other area in Mumbai',
  'Outside Mumbai'
];
const QUALIFICATIONS = ['12th (PCB)', '12th (other stream)', 'Diploma', "Bachelor's degree", "Master's degree", 'Other'];
const DECISIONS = ['I will', 'My parents or family', 'Together'];
const DAILY_CLASSES = ['Yes', 'No'];

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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashName(value) {
  const clean = String(value || '').trim().toLowerCase().replace(/[^\p{L}]/gu, '');
  return clean ? sha256(clean) : '';
}

function hashPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) digits = '91' + digits;
  if (digits.length === 11 && digits.charAt(0) === '0') digits = '91' + digits.slice(1);
  if (digits.length < 11 || digits.length > 15) return '';
  return sha256(digits);
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || req.headers['x-real-ip'] || '');
  return raw.split(',')[0].trim().slice(0, 64);
}

function campaignFields(sourceUrl) {
  const fields = { page: sourceUrl, utm_source: '', utm_medium: '', utm_campaign: '' };
  try {
    const url = new URL(sourceUrl);
    fields.page = url.origin + url.pathname;
    fields.utm_source = text(url.searchParams.get('utm_source'), 80);
    fields.utm_medium = text(url.searchParams.get('utm_medium'), 80);
    fields.utm_campaign = text(url.searchParams.get('utm_campaign'), 120);
  } catch (err) {}
  return fields;
}

async function saveLeadToSheet(lead) {
  const url = String(process.env.SHEETS_WEBHOOK_URL || '').trim();
  const secret = String(process.env.SHEETS_SECRET || '').trim();
  if (!url || !secret) return;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: secret,
      submitted_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }),
      name: lead.name,
      phone: lead.phone,
      course: lead.course,
      campus: lead.area,
      area: lead.area,
      qualification: lead.qualification,
      decision: lead.decision,
      call_time: lead.daily_classes,
      daily_classes: lead.daily_classes,
      page: lead.page,
      referrer: lead.referrer,
      utm_source: lead.utm_source,
      utm_medium: lead.utm_medium,
      utm_campaign: lead.utm_campaign
    })
  });
  if (!response.ok) console.error('sheet append failed', response.status);
}

async function sendMetaLead(req, lead) {
  const token = String(process.env.META_CAPI_TOKEN || '').trim();
  const pixelId = String(process.env.META_PIXEL_ID || '1656142772730961').replace(/\D/g, '');
  if (!token || !pixelId) return;

  const names = lead.name.toLowerCase().split(' ').filter(Boolean);
  const userData = {};
  const phone = hashPhone(lead.phone);
  const first = hashName(names[0]);
  const last = hashName(names.slice(1).join(' '));
  if (phone) userData.ph = [phone];
  if (first) userData.fn = [first];
  if (last) userData.ln = [last];

  const ip = clientIp(req);
  const agent = text(req.headers['user-agent'], 400);
  if (ip) userData.client_ip_address = ip;
  if (agent) userData.client_user_agent = agent;
  if (/^fb\.1\.\d+\.\d+$/.test(lead.fbp)) userData.fbp = lead.fbp;
  if (/^fb\.1\.\d+\.[\w-]+$/.test(lead.fbc)) userData.fbc = lead.fbc;

  const payload = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: lead.eventId,
      action_source: 'website',
      event_source_url: lead.sourceUrl,
      user_data: userData,
      custom_data: {
        content_name: lead.course,
        content_category: lead.campus
      }
    }]
  };
  const testCode = text(process.env.META_TEST_EVENT_CODE, 40);
  if (testCode) payload.test_event_code = testCode;

  const response = await fetch('https://graph.facebook.com/v25.0/' + pixelId + '/events?access_token=' + encodeURIComponent(token), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) console.error('meta capi failed', response.status);
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
  const area = text(body.area, 80);
  const qualification = text(body.qualification, 40);
  const decision = text(body.decision, 40);
  const dailyClasses = text(body.daily_classes, 20);
  const digits = phone.replace(/\D/g, '');

  if (name.length < 2 || !/^[6-9]\d{9}$/.test(digits) || COURSES.indexOf(course) === -1 || AREAS.indexOf(area) === -1 || QUALIFICATIONS.indexOf(qualification) === -1 || DECISIONS.indexOf(decision) === -1 || DAILY_CLASSES.indexOf(dailyClasses) === -1) {
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

  const eventId = text(body.event_id, 64).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64) || crypto.randomUUID();
  const sourceUrl = /^https?:\/\/[^\s]{8,500}$/.test(text(body.source_url, 500))
    ? text(body.source_url, 500)
    : 'https://nysahealthcare.co.in/';
  const referrer = /^https?:\/\/[^\s]{8,500}$/.test(text(body.referrer, 500)) ? text(body.referrer, 500) : '';
  const campaign = campaignFields(sourceUrl);

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
        'Area: ' + area,
        'Qualification: ' + qualification,
        'Who decides: ' + decision,
        'Daily classes at Kandivali West: ' + dailyClasses,
        'Page: ' + sourceUrl
      ].join('\n'),
      html: [
        '<h2 style="font-family:Arial,sans-serif;color:#1A2744">New admissions enquiry</h2>',
        '<p style="font-family:Arial,sans-serif;font-size:16px;color:#292929"><strong>Name:</strong> ' + escapeHtml(name) + '</p>',
        '<p style="font-family:Arial,sans-serif;font-size:16px;color:#292929"><strong>Mobile:</strong> ' + escapeHtml(phone) + '</p>',
        '<p style="font-family:Arial,sans-serif;font-size:16px;color:#292929"><strong>Course:</strong> ' + escapeHtml(course) + '</p>',
        '<p style="font-family:Arial,sans-serif;font-size:16px;color:#292929"><strong>Area:</strong> ' + escapeHtml(area) + '</p>',
        '<p style="font-family:Arial,sans-serif;font-size:16px;color:#292929"><strong>Qualification:</strong> ' + escapeHtml(qualification) + '</p>',
        '<p style="font-family:Arial,sans-serif;font-size:16px;color:#292929"><strong>Who decides:</strong> ' + escapeHtml(decision) + '</p>',
        '<p style="font-family:Arial,sans-serif;font-size:16px;color:#292929"><strong>Daily classes at Kandivali West:</strong> ' + escapeHtml(dailyClasses) + '</p>',
        '<p style="font-family:Arial,sans-serif;font-size:16px;color:#292929"><strong>Page:</strong> ' + escapeHtml(sourceUrl) + '</p>'
      ].join('')
    });
  } catch (err) {
    console.error('enquiry mail failed');
    res.status(502).json({ ok: false });
    return;
  }

  try {
    await saveLeadToSheet({
      name: name,
      phone: phone,
      course: course,
      area: area,
      qualification: qualification,
      decision: decision,
      daily_classes: dailyClasses,
      page: campaign.page,
      referrer: referrer,
      utm_source: campaign.utm_source,
      utm_medium: campaign.utm_medium,
      utm_campaign: campaign.utm_campaign
    });
  } catch (err) {
    console.error('sheet append failed');
  }

  try {
    await sendMetaLead(req, {
      name: name,
      phone: phone,
      course: course,
      campus: area,
      eventId: eventId,
      sourceUrl: sourceUrl,
      fbp: text(body.fbp, 80),
      fbc: text(body.fbc, 240)
    });
  } catch (err) {
    console.error('meta capi failed');
  }

  res.status(200).json({ ok: true, event_id: eventId });
};
