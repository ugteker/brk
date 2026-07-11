import nodemailer, { type Transporter } from 'nodemailer';
import { config, isSmtpConfigured } from '../../config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailerLike {
  send(message: MailMessage): Promise<void>;
}

// Sends mail via the SMTP settings in backend config (SMTP_HOST/PORT/USER/PASSWORD/FROM).
// When SMTP isn't configured, falls back to logging so local/dev environments keep working
// without requiring real SMTP credentials.
export class SmtpMailer implements MailerLike {
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined
      });
    }
    return this.transporter;
  }

  async send(message: MailMessage): Promise<void> {
    if (!isSmtpConfigured()) {
      // eslint-disable-next-line no-console
      console.warn(`[mailer] SMTP not configured, skipping email to ${message.to}: ${message.subject}`);
      return;
    }

    await this.getTransporter().sendMail({
      from: config.smtp.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
  }
}
