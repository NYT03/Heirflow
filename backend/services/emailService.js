const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return null;
}

const transporter = createTransporter();

/**
 * Sends an email via configured SMTP, and always records an audit/outbox entry
 * so notifications can be inspected in development without SMTP credentials.
 */
async function sendMail({ to, subject, text, html, category = 'GENERAL' }) {
  const from = process.env.SMTP_FROM || '"HeirFlow Estate Security" <noreply@heirflow.app>';
  const record = {
    id: uuidv4(),
    to,
    subject,
    category,
    preview: text.slice(0, 240),
    delivery_status: 'logged_local',
    sent_at: new Date().toISOString(),
  };

  if (transporter) {
    try {
      const info = await transporter.sendMail({ from, to, subject, text, html });
      record.delivery_status = 'sent_smtp';
      record.message_id = info.messageId;
      console.log(`📧 [EMAIL SENT] To: ${to} | Subject: ${subject} | ID: ${info.messageId}`);
    } catch (err) {
      record.delivery_status = 'smtp_failed';
      record.error = err.message;
      console.warn(`⚠️ [EMAIL SMTP ERROR] To: ${to} | ${err.message}`);
    }
  } else {
    console.log(`📧 [EMAIL OUTBOX] To: ${to} | Subject: ${subject}\n   ${text.replace(/\n/g, ' ')}`);
  }

  if (db.emailOutbox) {
    db.emailOutbox.save(record);
  }
  return record;
}

async function sendNomineeAddedEmail({ nomineeName, nomineeEmail, ownerName, ownerEmail, relationship }) {
  const subject = `HeirFlow: ${ownerName} has designated you as a trusted nominee`;
  const text =
    `Hello ${nomineeName},\n\n` +
    `${ownerName} (${ownerEmail}) has added you as a trusted nominee (${relationship || 'Beneficiary'}) on HeirFlow.\n\n` +
    `A unique cryptographic key share has been generated for your profile. Sign in to HeirFlow with ${nomineeEmail} and open the Nominees page to view your assigned key share.\n\n` +
    `— HeirFlow Security Team`;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
      <h2 style="color:#4f46e5;">HeirFlow — Trusted Nominee Designation</h2>
      <p>Hello <strong>${nomineeName}</strong>,</p>
      <p><strong>${ownerName}</strong> (${ownerEmail}) has designated you as a trusted nominee (<em>${relationship || 'Beneficiary'}</em>).</p>
      <p>Your unique cryptographic key share is now available inside your HeirFlow account under <strong>Nominees → Key Shares Assigned to Me</strong>.</p>
      <p style="color:#64748b;font-size:12px;">For security, raw key shares are never sent over email.</p>
    </div>
  `;

  return sendMail({ to: nomineeEmail, subject, text, html, category: 'NOMINEE_ADDED' });
}

async function sendClaimInitiatedEmails({
  claimId,
  deceasedName,
  deceasedEmail,
  claimantName,
  claimantEmail,
  otherNominees = [],
  requiredQuorum,
  totalNominees,
}) {
  const results = [];

  // 1. Critical Liveness Alert to Estate Owner
  results.push(
    await sendMail({
      to: deceasedEmail,
      subject: `URGENT HeirFlow Alert: Inheritance Claim Initiated on Your Estate`,
      text:
        `URGENT SECURITY NOTICE for ${deceasedName}:\n\n` +
        `${claimantName} (${claimantEmail}) has initiated an inheritance claim (Claim #${claimId.slice(0, 8)}).\n` +
        `Quorum: ${requiredQuorum} of ${totalNominees} nominees required.\n\n` +
        `If you are alive and this claim is unauthorized, log into HeirFlow immediately and click "I'm Alive (Abort Claim)" to halt execution permanently.`,
      category: 'CLAIM_LIVENESS_ALERT',
    })
  );

  // 2. Notification to Other Nominees for Quorum Participation
  for (const nom of otherNominees) {
    if (nom.email.toLowerCase() === claimantEmail.toLowerCase()) continue;
    results.push(
      await sendMail({
        to: nom.email,
        subject: `HeirFlow Action Required: Quorum Share Needed for ${deceasedName}'s Estate`,
        text:
          `Hello ${nom.name},\n\n` +
          `${claimantName} has opened an inheritance claim (Claim #${claimId.slice(0, 8)}) for ${deceasedName}.\n` +
          `This estate requires ${requiredQuorum} of ${totalNominees} (2/3 majority) nominee key shares.\n\n` +
          `Please log into HeirFlow → Claims Portal to submit your key share towards the existing claim.`,
        category: 'CLAIM_QUORUM_REQUEST',
      })
    );
  }

  return results;
}

async function sendClaimSettledEmails({ claimId, deceasedName, nomineeEmails = [], contractAddress, txHash }) {
  const results = [];
  for (const email of nomineeEmails) {
    results.push(
      await sendMail({
        to: email,
        subject: `HeirFlow: Estate Claim #${claimId.slice(0, 8)} Settled & Assets Released`,
        text:
          `The inheritance claim for ${deceasedName} (Claim #${claimId.slice(0, 8)}) has completed its grace period and executed via Smart Contract.\n\n` +
          `Smart Contract: ${contractAddress}\n` +
          `Blockchain Tx: ${txHash}\n\n` +
          `All nominee key shares have now been permanently destroyed. Log into HeirFlow → Claims Portal to decrypt and access the inherited assets.`,
        category: 'CLAIM_SETTLED',
      })
    );
  }
  return results;
}

module.exports = {
  sendMail,
  sendNomineeAddedEmail,
  sendClaimInitiatedEmails,
  sendClaimSettledEmails,
};
