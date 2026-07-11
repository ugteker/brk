import type { FastifyInstance } from 'fastify';
import { config, isGoogleOAuthConfigured } from '../../config';
import type { UserRepositoryLike } from './repository';
import { toAuthUser } from './types';
import { hashPassword, verifyPassword } from './password';
import { signSessionToken, verifySessionToken } from './jwt';
import { buildGoogleAuthUrl, type GoogleOAuthClient } from './google-oauth';

export interface AuthRoutesDeps {
  userRepository: UserRepositoryLike;
  googleOAuthClient: GoogleOAuthClient;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setSessionCookie(reply: import('fastify').FastifyReply, userId: string) {
  const token = signSessionToken({ userId });
  reply.setCookie(config.auth.cookieName, token, {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'lax',
    path: '/'
  });
}

export async function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps) {
  const { userRepository, googleOAuthClient } = deps;

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
    setSessionCookie(reply, user.id);
    return reply.status(201).send(toAuthUser(user));
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
      }

      setSessionCookie(reply, user.id);
      return reply.redirect(config.appBaseUrl);
    } catch {
      return reply.status(502).send({ code: 'google_oauth_failed', message: 'Google sign-in failed' });
    }
  });
}
