import 'dotenv/config';
import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_PASSWORD = process.env.SITE_PASSWORD || 'Y##';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

/* ==========================================================================
   1. SECURE INDIVIDUAL TRANSPORTER (PREVENTS POOL TIMEOUTS)
   ========================================================================== */
function createTransporter(email, appPassword) {
  const cleanEmail = email.toLowerCase().trim();
  const cleanPass = appPassword.replace(/\s+/g, '').trim();
  const senderDomain = cleanEmail.includes('@') ? cleanEmail.split('@')[1] : 'gmail.com';

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    name: senderDomain,
    auth: {
      user: cleanEmail,
      pass: cleanPass
    },
    socketTimeout: 15000,
    connectionTimeout: 15000,
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2'
    }
  });
}

/* ==========================================================================
   2. RECIPIENT & SPINTAX HELPERS
   ========================================================================== */
function parseRecipientData(input) {
  let email = '';
  let rawName = '';

  if (typeof input === 'object' && input !== null) {
    email = (input.email || input.recipient || '').trim();
    rawName = (input.name || input.fullName || input.first_name || '').trim();
  } else if (typeof input === 'string') {
    const str = input.trim();
    const angleMatch = str.match(/^(?:"?([^"]*)"?\s)?<([^>]+)>$/);
    if (angleMatch) {
      rawName = angleMatch[1] ? angleMatch[1].trim() : '';
      email = angleMatch[2].trim();
    } else if (str.includes(',')) {
      const parts = str.split(',');
      if (parts[0].includes('@')) {
        email = parts[0].trim();
        rawName = parts[1].trim();
      } else {
        rawName = parts[0].trim();
        email = parts[1].trim();
      }
    } else {
      email = str;
    }
  }

  if (!rawName && email.includes('@')) {
    const prefix = email.split('@')[0];
    rawName = prefix.replace(/[0-9_.-]/g, ' ').trim();
  }

  const formattedName = rawName
    ? rawName.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    : '';

  const firstName = formattedName ? formattedName.split(' ')[0] : '';
  const domain = email.includes('@') ? email.split('@')[1] : '';

  return {
    email: email.toLowerCase(),
    name: formattedName,
    firstName: firstName,
    domain: domain
  };
}

function parseSpintax(text) {
  if (!text) return '';
  let spun = String(text);
  const regex = /\{([^{}]+)\}/s;
  let iterations = 0;

  while (regex.test(spun) && iterations < 25) {
    spun = spun.replace(regex, (_, choices) => {
      if (!choices.includes('|')) return choices;
      const options = choices.split('|');
      const pick = options[Math.floor(Math.random() * options.length)];
      return pick ? pick.trim() : '';
    });
    iterations++;
  }
  return spun.replace(/[\{\}]/g, '').trim();
}

function stripHtmlTags(htmlString) {
  return htmlString
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ==========================================================================
   3. API ROUTES
   ========================================================================== */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (password === SITE_PASSWORD) return res.json({ success: true, message: 'Authorized' });
  return res.status(401).json({ success: false, message: 'Unauthorized Password' });
});

app.post('/api/verify', async (req, res) => {
  const { email, appPassword } = req.body;
  if (!email || !appPassword) {
    return res.status(400).json({ success: false, message: 'Credentials required' });
  }

  try {
    const transporter = createTransporter(email, appPassword);
    await transporter.verify();
    return res.json({ success: true, message: 'SMTP ready' });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'SMTP Auth Failed.'
    });
  }
});

/* ==========================================================================
   4. NON-TIMEOUT SENDING ROUTE (INBOX OPTIMIZED & SPEED INTACT)
   ========================================================================== */
app.post('/api/send-stream', async (req, res) => {
  const { email, appPassword, senderName, subject, messageBody, recipients } = req.body;

  if (!email || !appPassword || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ success: false, error: 'Invalid Request Data' });
  }

  // Disable standard timeout issues for serverless environments
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const cleanEmail = email.toLowerCase().trim();
  const cleanSenderName = (senderName || '').replace(/["\r\n]/g, '').trim();

  const defaultSubject = '{Quick question|Site Overview|Quick note}';
  const defaultBody = `Your site looks great, but a small issue is keeping it from showing in the top results. Can I send a screenshot?`;

  const finalSubjectTemplate = (subject && subject.trim()) ? subject : defaultSubject;
  const rawBodyTemplate = (messageBody && messageBody.trim()) ? messageBody : defaultBody;

  let transporter;
  try {
    transporter = createTransporter(email, appPassword);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ success: false, error: 'Transporter Error: ' + err.message })}\n\n`);
    res.end();
    return;
  }

  // Process sequentially with exact same speed and safe intervals
  for (let i = 0; i < recipients.length; i++) {
    const recipient = parseRecipientData(recipients[i]);
    if (!recipient.email) continue;

    try {
      const personalizedSubject = parseSpintax(
        finalSubjectTemplate
          .replace(/{Name}/gi, recipient.name || 'there')
          .replace(/{FirstName}/gi, recipient.firstName || 'there')
      );
      const personalizedBody = parseSpintax(
        rawBodyTemplate
          .replace(/{Name}/gi, recipient.name || 'there')
          .replace(/{FirstName}/gi, recipient.firstName || 'there')
      );
      const isHtml = /<[a-z][\s\S]*>/i.test(personalizedBody);

      // --- INBOX OPTIMIZATION HEADERS ---
      const domainPart = cleanEmail.split('@')[1] || 'gmail.com';
      const uniqueMessageId = `<${Date.now()}.${Math.random().toString(36).substring(2, 12)}@${domainPart}>`;

      const mailOptions = {
        from: cleanSenderName ? `"${cleanSenderName}" <${cleanEmail}>` : cleanEmail,
        to: recipient.name ? `"${recipient.name}" <${recipient.email}>` : recipient.email,
        replyTo: cleanEmail,
        subject: personalizedSubject,
        textEncoding: 'quoted-printable',
        headers: {
          'Message-ID': uniqueMessageId,
          'X-Mailer': 'Microsoft Outlook 16.0',
          'X-Priority': '3',
          'Importance': 'Normal'
        },
        text: isHtml ? stripHtmlTags(personalizedBody) : personalizedBody,
        html: isHtml ? `<div dir="ltr">${personalizedBody}</div>` : `<div dir="ltr">${personalizedBody.replace(/\n/g, '<br>')}</div>`
      };

      await transporter.sendMail(mailOptions);
      res.write(`data: ${JSON.stringify({ success: true, recipient: recipient.email, name: recipient.name })}\n\n`);

      // Same speed gap maintained
      await new Promise(resolve => setTimeout(resolve, 400));

    } catch (err) {
      res.write(`data: ${JSON.stringify({ success: false, recipient: recipient.email, error: err.message })}\n\n`);
    }
  }

  try {
    transporter.close();
  } catch (e) {}

  res.write('data: [DONE]\n\n');
  res.end();
});

app.post('/api/stop', (req, res) => {
  res.json({ success: true, message: 'Stopped' });
});

app.listen(PORT, () => {
  console.log(`🚀 Mailer running smoothly on port ${PORT}`);
});

export default app;
