import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { config, isGoogleOAuthConfigured } from '../../config';
import type { UserRepositoryLike } from './repository';
import { toAuthUser } from './types';
import { hashPassword, verifyPassword } from './password';
import { signSessionToken, verifySessionToken } from './jwt';
import { buildGoogleAuthUrl, type GoogleOAuthClient } from './google-oauth';
import type { MailerLike } from './mailer';
import { sendEmailConfirmationLink, sendPasswordResetLink, sendAdminNewUserNotification } from './emails';

export interface AuthRoutesDeps {
  userRepository: UserRepositoryLike;
  googleOAuthClient: GoogleOAuthClient;
  mailer?: MailerLike;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function setSessionCookie(reply: import('fastify').FastifyReply, userId: string) {
  const token = signSessionToken({ userId });
  reply.setCookie(config.auth.cookieName, token, {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'lax',
    path: '/'
  });
}

/** Best-effort admin notification for every newly created user account, regardless of signup
 * method - failures are logged but never thrown, so a broken/misconfigured mailer can't block
 * signup. Skipped entirely if no mailer or no ADMIN_EMAIL is configured, or if the new account
 * itself *is* the admin (bootstrap admin account, not a "real" signup to be notified about). */
async function notifyAdminOfNewUser(
  mailer: MailerLike | undefined,
  newUserEmail: string,
  signupMethod: 'password' | 'google'
): Promise<void> {
  const adminEmail = config.auth.bootstrapAdmin.email;
  if (!mailer || !adminEmail || adminEmail.toLowerCase() === newUserEmail.toLowerCase()) return;
  try {
    await sendAdminNewUserNotification(mailer, adminEmail, newUserEmail, signupMethod);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[auth] Failed to send admin new-user notification for ${newUserEmail}:`, error);
  }
}

export async function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps) {
  const { userRepository, googleOAuthClient, mailer } = deps;

  app.post('/api/auth/signup', async (req, reply) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };

    if (!email || !EMAIL_PATTERN.test(email)) {
      return reply.status(400).send({ code: 'validation_error', message: 'A valid email is required' });
    }
    if (!password || password.length < 8) {
      return reply.status(400).send({ code: 'validation_error', message: 'Password must be at least 8 characters' });
    }

    const existing = await userRepository.findByEmail(email);
    if (existing) {
      return reply.status(409).send({ code: 'email_taken', message: 'An account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);
    const user = await userRepository.createWithPassword(email, passwordHash);
    void notifyAdminOfNewUser(mailer, user.email, 'password');

    // Two-step signup: the account is created but stays unverified/unusable for login until the
    // user clicks the confirmation link we email them - no session cookie is set here.
    const token = generateToken();
    await userRepository.setEmailVerificationToken(user.id, token, new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS));
    if (mailer) {
      try {
        await sendEmailConfirmationLink(mailer, user.email, token);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`[auth] Failed to send confirmation email to ${user.email}:`, error);
      }
    }

    return reply.status(201).send({ status: 'confirmation_required', email: user.email });
  });

  app.get('/api/auth/confirm-email', async (req, reply) => {
    const { token } = req.query as { token?: string };
    if (!token) {
      return reply.redirect(`${config.appBaseUrl}/?emailConfirmed=0`);
    }

    const user = await userRepository.verifyEmailByToken(token);
    if (!user) {
      return reply.redirect(`${config.appBaseUrl}/?emailConfirmed=0`);
    }

    return reply.redirect(`${config.appBaseUrl}/?emailConfirmed=1`);
  });

  app.post('/api/auth/resend-confirmation', async (req, reply) => {
    const { email } = (req.body ?? {}) as { email?: string };
    if (!email || !EMAIL_PATTERN.test(email)) {
      return reply.status(400).send({ code: 'validation_error', message: 'A valid email is required' });
    }

    // Always respond 200 regardless of whether the account exists/is already verified, so this
    // endpoint can't be used to enumerate registered email addresses.
    const user = await userRepository.findByEmail(email);
    if (user && !user.emailVerified) {
      const token = generateToken();
      await userRepository.setEmailVerificationToken(user.id, token, new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS));
      if (mailer) {
        try {
          await sendEmailConfirmationLink(mailer, user.email, token);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn(`[auth] Failed to resend confirmation email to ${user.email}:`, error);
        }
      }
    }

    return reply.status(200).send({ status: 'ok' });
  });

  app.post('/api/auth/forgot-password', async (req, reply) => {
    const { email } = (req.body ?? {}) as { email?: string };
    if (!email || !EMAIL_PATTERN.test(email)) {
      return reply.status(400).send({ code: 'validation_error', message: 'A valid email is required' });
    }

    // Same anti-enumeration approach as resend-confirmation - always 200.
    const user = await userRepository.findByEmail(email);
    if (user && user.passwordHash) {
      const token = generateToken();
      await userRepository.setPasswordResetToken(user.id, token, new Date(Date.now() + PASSWORD_RESET_TTL_MS));
      if (mailer) {
        try {
          await sendPasswordResetLink(mailer, user.email, token);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn(`[auth] Failed to send password reset email to ${user.email}:`, error);
        }
      }
    }

    return reply.status(200).send({ status: 'ok' });
  });

  app.post('/api/auth/reset-password', async (req, reply) => {
    const { token, password } = (req.body ?? {}) as { token?: string; password?: string };
    if (!token) {
      return reply.status(400).send({ code: 'validation_error', message: 'Missing reset token' });
    }
    if (!password || password.length < 8) {
      return reply.status(400).send({ code: 'validation_error', message: 'Password must be at least 8 characters' });
    }

    const passwordHash = await hashPassword(password);
    const user = await userRepository.resetPasswordByToken(token, passwordHash);
    if (!user) {
      return reply.status(400).send({ code: 'invalid_or_expired_token', message: 'This reset link is invalid or has expired' });
    }

    return reply.status(200).send({ status: 'ok' });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
    if (!email || !password) {
      return reply.status(400).send({ code: 'validation_error', message: 'Email and password are required' });
    }

    const user = await userRepository.findByEmail(email);
    if (!user || !user.passwordHash) {
      return reply.status(401).send({ code: 'invalid_credentials', message: 'Invalid email or password' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ code: 'invalid_credentials', message: 'Invalid email or password' });
    }

    if (user.locked) {
      return reply.status(403).send({ code: 'account_locked', message: 'This account has been locked. Contact an administrator.' });
    }

    if (!user.emailVerified) {
      return reply
        .status(403)
        .send({ code: 'email_not_verified', message: 'Please confirm your email address before logging in. Check your inbox for the confirmation link.' });
    }

    setSessionCookie(reply, user.id);
    return reply.status(200).send(toAuthUser(user));
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(config.auth.cookieName, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/api/auth/me', async (req, reply) => {
    const token = req.cookies[config.auth.cookieName];
    const payload = token ? verifySessionToken(token) : null;
    if (!payload) {
      return reply.status(401).send({ code: 'unauthenticated', message: 'Not signed in' });
    }

    const user = await userRepository.findById(payload.userId);
    if (!user) {
      return reply.status(401).send({ code: 'unauthenticated', message: 'Not signed in' });
    }

    return reply.status(200).send(toAuthUser(user));
  });

  app.get('/api/auth/google', async (_req, reply) => {
    if (!isGoogleOAuthConfigured()) {
      return reply.status(503).send({ code: 'google_oauth_not_configured', message: 'Google sign-in is not configured' });
    }
    const state = Math.random().toString(36).slice(2);
    return reply.redirect(buildGoogleAuthUrl(state));
  });

  app.get('/api/auth/google/callback', async (req, reply) => {
    if (!isGoogleOAuthConfigured()) {
      return reply.status(503).send({ code: 'google_oauth_not_configured', message: 'Google sign-in is not configured' });
    }

    const { code } = req.query as { code?: string };
    if (!code) {
      return reply.status(400).send({ code: 'validation_error', message: 'Missing authorization code' });
    }

    try {
      const profile = await googleOAuthClient.exchangeCodeForProfile(code);

      let user = await userRepository.findByGoogleId(profile.sub);
      if (!user) {
        const existingByEmail = await userRepository.findByEmail(profile.email);
        user = existingByEmail
          ? await userRepository.linkGoogleId(existingByEmail.id, profile.sub)
          : await userRepository.createWithGoogle(profile.email, profile.sub, profile.name ?? null);
        if (!existingByEmail) void notifyAdminOfNewUser(mailer, user.email, 'google');
      }

      if (user.locked) {
        return reply.redirect(`${config.appBaseUrl}/?accountLocked=1`);
      }

      setSessionCookie(reply, user.id);
      return reply.redirect(config.appBaseUrl);
    } catch {
      return reply.status(502).send({ code: 'google_oauth_failed', message: 'Google sign-in failed' });
    }
  });
}
