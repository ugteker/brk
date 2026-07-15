/**
 * Lightweight structured logger for the API.
 *
 * - Always writes to stdout (info/debug) or stderr (warn/error).
 * - warn() and error() always include the stack trace of any Error passed as the
 *   second argument so that failures are self-documenting in logs.
 * - Silent in test environments (NODE_ENV === 'test') to keep test output clean.
 */

const isSilent = process.env.NODE_ENV === 'test';

function timestamp(): string {
  return new Date().toISOString();
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    const base = `${err.name}: ${err.message}`;
    return err.stack ? err.stack : base;
  }
  if (err !== undefined && err !== null) {
    return String(err);
  }
  return '';
}

export const logger = {
  info(message: string): void {
    if (isSilent) return;
    process.stdout.write(`${timestamp()} INFO  ${message}\n`);
  },

  warn(message: string, err?: unknown): void {
    if (isSilent) return;
    const errPart = err !== undefined ? `\n  ${formatError(err).replace(/\n/g, '\n  ')}` : '';
    process.stderr.write(`${timestamp()} WARN  ${message}${errPart}\n`);
  },

  error(message: string, err?: unknown): void {
    if (isSilent) return;
    const errPart = err !== undefined ? `\n  ${formatError(err).replace(/\n/g, '\n  ')}` : '';
    process.stderr.write(`${timestamp()} ERROR ${message}${errPart}\n`);
  },
};
