export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  hasPassword: boolean;
  hasGoogleLinked: boolean;
  emailVerified: boolean;
  createdAt: Date;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  displayName: string | null;
  emailVerified: boolean;
  emailVerificationToken: string | null;
  emailVerificationExpiresAt: Date | null;
  locked: boolean;
  passwordResetToken: string | null;
  passwordResetExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toAuthUser(user: UserRecord): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    hasPassword: user.passwordHash !== null,
    hasGoogleLinked: user.googleId !== null,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt
  };
}
