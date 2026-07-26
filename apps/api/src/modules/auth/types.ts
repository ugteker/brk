export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  role: 'user' | 'admin';
  hasPassword: boolean;
  hasGoogleLinked: boolean;
  emailVerified: boolean;
  language: string;
  createdAt: Date;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  displayName: string | null;
  role: 'user' | 'admin';
  emailVerified: boolean;
  emailVerificationToken: string | null;
  emailVerificationExpiresAt: Date | null;
  locked: boolean;
  passwordResetToken: string | null;
  passwordResetExpiresAt: Date | null;
  language: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toAuthUser(user: UserRecord): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    hasPassword: user.passwordHash !== null,
    hasGoogleLinked: user.googleId !== null,
    emailVerified: user.emailVerified,
    language: user.language,
    createdAt: user.createdAt
  };
}
