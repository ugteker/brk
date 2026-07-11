// Central place for all backend configuration read from environment variables.
// Copy `.env` to `.env` (or set these in your process environment) to configure
// authentication and outbound email for this deployment.
//
// Values are read from `process.env` lazily via getters (not cached at import time) so
// that tests can stub environment variables per-case without needing a module reload.

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

export const config = {
  auth: {
    get jwtSecret() {
      return process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me';
    },
    get jwtExpiresIn() {
      return process.env.JWT_EXPIRES_IN ?? '7d';
    },
    get cookieName() {
      return process.env.AUTH_COOKIE_NAME ?? 'brokerino_session';
    },
    get cookieSecure() {
      return readBool(process.env.AUTH_COOKIE_SECURE, false);
    },
    google: {
      get clientId() {
        return process.env.GOOGLE_CLIENT_ID ?? '';
      },
      get clientSecret() {
        return process.env.GOOGLE_CLIENT_SECRET ?? '';
      },
      get callbackUrl() {
        return process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3000/api/auth/google/callback';
      }
    },
    // Optional bootstrap admin account, created on startup if it doesn't exist yet.
    // Lets an operator configure a fixed username/password login purely via backend config.
    bootstrapAdmin: {
      get email() {
        return process.env.ADMIN_EMAIL;
      },
      get password() {
        return process.env.ADMIN_PASSWORD;
      }
    }
  },
  smtp: {
    get host() {
      return process.env.SMTP_HOST ?? '';
    },
    get port() {
      return Number(process.env.SMTP_PORT ?? '587');
    },
    get secure() {
      return readBool(process.env.SMTP_SECURE, false);
    },
    get user() {
      return process.env.SMTP_USER ?? '';
    },
    get password() {
      return process.env.SMTP_PASSWORD ?? '';
    },
    get from() {
      return process.env.SMTP_FROM ?? 'Brokerino <no-reply@brokerino.local>';
    }
  },
  get appBaseUrl() {
    return process.env.APP_BASE_URL ?? 'http://localhost:4173';
  }
};

export function isSmtpConfigured(): boolean {
  return config.smtp.host.length > 0;
}

export function isGoogleOAuthConfigured(): boolean {
  return config.auth.google.clientId.length > 0 && config.auth.google.clientSecret.length > 0;
}
