import type { MailerLike } from './mailer';
import { config } from '../../config';

function confirmationUrl(token: string): string {
  return `${config.appBaseUrl}/api/auth/confirm-email?token=${encodeURIComponent(token)}`;
}

function resetUrl(token: string): string {
  return `${config.appBaseUrl}/?resetToken=${encodeURIComponent(token)}`;
}


export async function sendEmailConfirmationLink(mailer: MailerLike, to: string, token: string): Promise<void> {
  const url = confirmationUrl(token);
  await mailer.send({
    to,
    subject: 'Confirm your ChatTrader account',
    text: [
      'Welcome to ChatTrader!',
      '',
      'Please confirm your email address by clicking the link below:',
      url,
      '',
      'This link expires in 24 hours. If you did not create this account, you can ignore this email.'
    ].join('\n'),
    html: `
      <p>Welcome to ChatTrader!</p>
      <p>Please confirm your email address by clicking the link below:</p>
      <p><a href="${url}">${url}</a></p>
      <p style="color:#666;font-size:12px;">This link expires in 24 hours. If you did not create this account, you can ignore this email.</p>
    `
  });
}

export async function sendPasswordResetLink(mailer: MailerLike, to: string, token: string): Promise<void> {
  const url = resetUrl(token);
  await mailer.send({
    to,
    subject: 'Reset your ChatTrader password',
    text: [
      'We received a request to reset your ChatTrader password.',
      '',
      'Click the link below to choose a new password:',
      url,
      '',
      'This link expires in 1 hour. If you did not request this, you can ignore this email.'
    ].join('\n'),
    html: `
      <p>We received a request to reset your ChatTrader password.</p>
      <p>Click the link below to choose a new password:</p>
      <p><a href="${url}">${url}</a></p>
      <p style="color:#666;font-size:12px;">This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
    `
  });
}

/** Notifies the configured admin (`ADMIN_EMAIL`) whenever a new user account is created, via
 * either password signup or Google sign-in. Best-effort only - a failure here must never block
 * or fail the signup flow itself, so callers should catch/log rather than await-and-throw. */
export async function sendAdminNewUserNotification(
  mailer: MailerLike,
  adminEmail: string,
  newUserEmail: string,
  signupMethod: 'password' | 'google'
): Promise<void> {
  const methodLabel = signupMethod === 'google' ? 'Google sign-in' : 'email/password';
  await mailer.send({
    to: adminEmail,
    subject: 'New ChatTrader account created',
    text: [
      `A new user account was created via ${methodLabel}:`,
      '',
      newUserEmail,
      '',
      new Date().toISOString()
    ].join('\n'),
    html: `
      <p>A new user account was created via ${methodLabel}:</p>
      <p><strong>${newUserEmail}</strong></p>
      <p style="color:#666;font-size:12px;">${new Date().toISOString()}</p>
    `
  });
}

