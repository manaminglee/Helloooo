/**
 * Creator program emails — SMTP (nodemailer), Resend API, or test-mode console log.
 */
const nodemailer = require('nodemailer');

let smtpTransport = null;

function getFrontendUrl() {
  const raw = (process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN || '').split(',')[0].trim();
  return raw || 'https://manamingle.site';
}

function getAdminEmail() {
  return (process.env.CREATOR_ADMIN_EMAIL || process.env.SUPPORT_EMAIL || 'manaminglee@gmail.com').trim();
}

function getFromAddress() {
  return (process.env.EMAIL_FROM || 'ManaMingle Creators <noreply@manamingle.site>').trim();
}

function getSmtpTransport() {
  if (smtpTransport) return smtpTransport;
  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').trim();
  if (!host || !user || !pass) return null;
  smtpTransport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
  return smtpTransport;
}

async function sendCreatorEmail({ to, subject, html, text }) {
  if (!to) return { ok: false, skipped: true, reason: 'no_recipient' };

  if (process.env.EMAIL_TEST_MODE === 'true') {
    console.log('[EMAIL:TEST]', { to, subject, preview: (text || html || '').slice(0, 240) });
    return { ok: true, test: true };
  }

  const from = getFromAddress();
  const payload = { from, to, subject, html, text: text || html?.replace(/<[^>]+>/g, ' ') };

  try {
    const transport = getSmtpTransport();
    if (transport) {
      await transport.sendMail(payload);
      return { ok: true, via: 'smtp' };
    }

    const resendKey = (process.env.RESEND_API_KEY || '').trim();
    if (resendKey) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.text();
        console.error('[EMAIL] Resend failed:', err);
        return { ok: false, error: err };
      }
      return { ok: true, via: 'resend' };
    }

    console.warn('[EMAIL] Not configured (set SMTP_* or RESEND_API_KEY). Skipped:', subject, '→', to);
    return { ok: false, skipped: true, reason: 'not_configured' };
  } catch (e) {
    console.error('[EMAIL] Send failed:', e.message);
    return { ok: false, error: e.message };
  }
}

async function notifyAdminNewApplication(creator) {
  const admin = getAdminEmail();
  const subject = `New creator application: @${creator.handle_name}`;
  const text = [
    `New creator application on ManaMingle`,
    ``,
    `Handle: @${creator.handle_name}`,
    `Platform: ${creator.platform}`,
    `Profile: ${creator.profile_link}`,
    `Access code: ${creator.referral_code}`,
    creator.email ? `Email: ${creator.email}` : '',
    ``,
    `Review in the admin panel.`,
  ].filter(Boolean).join('\n');
  return sendCreatorEmail({ to: admin, subject, html: `<pre style="font-family:sans-serif">${text}</pre>`, text });
}

async function notifyCreatorApproved(creator, plainPassword) {
  if (!creator.email) return { ok: false, skipped: true, reason: 'no_email' };
  const site = getFrontendUrl();
  const subject = 'Your ManaMingle creator application was approved';
  const text = [
    `Hi @${creator.handle_name},`,
    ``,
    `Your creator application has been approved.`,
    ``,
    `Login handle: ${creator.handle_name}`,
    plainPassword ? `Temporary password: ${plainPassword}` : `Use your existing password.`,
    `Referral code: ${creator.referral_code}`,
    `Referral link: ${site}/?ref=${creator.referral_code}`,
    ``,
    `Log in at ${site} → Creator Program → Creator Login.`,
    `Change your password after first login if you use the reset link in the login modal.`,
    ``,
    `— ManaMingle Team`,
  ].join('\n');
  return sendCreatorEmail({ to: creator.email, subject, html: `<pre style="font-family:sans-serif;line-height:1.5">${text}</pre>`, text });
}

async function notifyCreatorRejected(creator, reason) {
  if (!creator.email) return { ok: false, skipped: true, reason: 'no_email' };
  const subject = 'Update on your ManaMingle creator application';
  const text = [
    `Hi @${creator.handle_name},`,
    ``,
    `Thank you for applying. We could not approve your application at this time.`,
    reason ? `Reason: ${reason}` : '',
    ``,
    `You may re-apply after updating your profile link and platform presence.`,
    ``,
    `— ManaMingle Team`,
  ].filter(Boolean).join('\n');
  return sendCreatorEmail({ to: creator.email, subject, html: `<pre style="font-family:sans-serif;line-height:1.5">${text}</pre>`, text });
}

async function notifyWithdrawalUpdate(creator, withdrawal, status, note) {
  if (!creator.email) return { ok: false, skipped: true, reason: 'no_email' };
  const subject = status === 'paid'
    ? 'Your ManaMingle creator payout was processed'
    : 'Update on your ManaMingle withdrawal request';
  const text = [
    `Hi @${creator.handle_name},`,
    ``,
    status === 'paid'
      ? `Your withdrawal of ₹${withdrawal.amount_rs || 0} to ${withdrawal.upi} has been marked as paid.`
      : `Your withdrawal request was not approved. Your creator coins have been restored to your balance.`,
    note ? `Note: ${note}` : '',
    ``,
    `— ManaMingle Team`,
  ].filter(Boolean).join('\n');
  return sendCreatorEmail({ to: creator.email, subject, html: `<pre style="font-family:sans-serif;line-height:1.5">${text}</pre>`, text });
}

async function notifyPasswordReset(creator, resetUrl) {
  if (!creator.email) return { ok: false, skipped: true, reason: 'no_email' };
  const subject = 'Reset your ManaMingle creator password';
  const text = [
    `Hi @${creator.handle_name},`,
    ``,
    `We received a password reset request for your creator account.`,
    ``,
    `Reset link (valid 1 hour):`,
    resetUrl,
    ``,
    `If you did not request this, ignore this email.`,
    ``,
    `— ManaMingle Team`,
  ].join('\n');
  return sendCreatorEmail({ to: creator.email, subject, html: `<p>Hi @${creator.handle_name},</p><p><a href="${resetUrl}">Reset your password</a> (expires in 1 hour)</p>`, text });
}

async function notifyPasswordResetByAdmin(creator, plainPassword) {
  if (!creator.email) return { ok: false, skipped: true, reason: 'no_email' };
  const subject = 'Your ManaMingle creator password was reset';
  const text = [
    `Hi @${creator.handle_name},`,
    ``,
    `An admin reset your creator password.`,
    plainPassword ? `New temporary password: ${plainPassword}` : '',
    ``,
    `Log in and change it via Creator Login → Forgot password if needed.`,
    ``,
    `— ManaMingle Team`,
  ].filter(Boolean).join('\n');
  return sendCreatorEmail({ to: creator.email, subject, html: `<pre style="font-family:sans-serif">${text}</pre>`, text });
}

module.exports = {
  sendCreatorEmail,
  getFrontendUrl,
  notifyAdminNewApplication,
  notifyCreatorApproved,
  notifyCreatorRejected,
  notifyWithdrawalUpdate,
  notifyPasswordReset,
  notifyPasswordResetByAdmin,
};
