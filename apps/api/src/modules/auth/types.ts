export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  hasPassword: boolean;
  hasGoogleLinked: boolean;
  createdAt: Date;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  displayName: string | null;
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
    createdAt: user.createdAt
  };
}
