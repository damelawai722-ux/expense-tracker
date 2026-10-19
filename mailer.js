// =====================================================================
//  Sends email through a provider's web API (HTTPS).
//  Render's free plan blocks normal email ports (SMTP), so an API is the reliable way.
//
//  Set these in Render > Environment:
//    BREVO_API_KEY   your Brevo API key          (or RESEND_API_KEY for Resend)
//    MAIL_FROM       a sender address you verified with the provider
//    MAIL_FROM_NAME  optional, defaults to "Expense Tracker"
// =====================================================================
const mailReady = () => !!(process.env.MAIL_FROM && (process.env.BREVO_API_KEY || process.env.RESEND_API_KEY));

async function sendMail({ to, subject, text, html }) {
  const fromEmail = process.env.MAIL_FROM;
  const fromName = process.env.MAIL_FROM_NAME || 'Expense Tracker';
  if (!mailReady()) throw new Error('Email is not set up (need MAIL_FROM and BREVO_API_KEY or RESEND_API_KEY)');

  if (process.env.BREVO_API_KEY) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: to }],
        subject, htmlContent: html, textContent: text
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) throw new Error('Brevo said ' + r.status + ': ' + (await r.text()).slice(0, 300));
    return;
  }

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: fromName + ' <' + fromEmail + '>', to: [to], subject, html, text }),
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error('Resend said ' + r.status + ': ' + (await r.text()).slice(0, 300));
}

// A plain, clear email carrying a 6-digit code
function codeEmail(code, reason, minutes) {
  const text = 'Your Expense Tracker code is ' + code + '.\n\n' + reason + '\nIt expires in ' + minutes +
    ' minutes. If you did not ask for this, you can ignore this email.';
  const html = '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px">' +
    '<h2 style="margin:0 0 12px">Expense Tracker</h2>' +
    '<p style="margin:0 0 16px;color:#333">' + reason + '</p>' +
    '<div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f3f3ee;border-radius:12px;padding:16px;text-align:center">' + code + '</div>' +
    '<p style="color:#666;font-size:13px;margin-top:16px">This code expires in ' + minutes + ' minutes. If you did not ask for it, you can safely ignore this email.</p></div>';
  return { text, html };
}

module.exports = { sendMail, mailReady, codeEmail };