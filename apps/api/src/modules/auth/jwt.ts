import jwt from 'jsonwebtoken';
import { config } from '../../config';

export interface SessionTokenPayload {
  userId: string;
}

export function signSessionToken(payload: SessionTokenPayload): string {
  return jwt.sign(payload, config.auth.jwtSecret, { expiresIn: config.auth.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret);
    if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
      return { userId: String((decoded as Record<string, unknown>).userId) };
    }
    return null;
  } catch {
    return null;
  }
}
