import nodemailer, { type Transporter } from 'nodemailer';
import { config, isSmtpConfigured } from '../../config';
import { logger } from '../../lib/logger';

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
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
        // Without these, nodemailer/Node's default socket timeouts can leave a
        // send() hanging for a long time (well past nginx's own proxy
        // timeout) if the configured SMTP host is unreachable/blocked from
        // this network - callers awaiting send() would otherwise appear to
        // hang the whole HTTP request. 10s is generous for any real SMTP
        // provider's connect/greeting/response steps.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000
      });
    }
    return this.transporter;
  }

  async send(message: MailMessage): Promise<void> {
    if (!isSmtpConfigured()) {
      logger.warn(`[mailer] SMTP not configured, skipping email to ${message.to}: ${message.subject}`);
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
