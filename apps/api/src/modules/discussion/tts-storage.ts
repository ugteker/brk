import { promises as fs } from 'fs';
import path from 'path';

/** Stores rendered TTS mp3 buffers on the local filesystem and returns the API URL
 * they are served from (see the GET /api/discussions/audio/:file route). */
export class FileTtsStorage {
  constructor(private readonly dir: string) {}

  async save(key: string, buffer: Buffer): Promise<string> {
    const fileName = `${sanitizeAudioFileName(key)}.mp3`;
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(path.join(this.dir, fileName), buffer);
    return `/api/discussions/audio/${fileName}`;
  }
}

/** Restrict stored/served file names to a safe charset so the serving route can never
 * be used to escape the audio directory. */
export function sanitizeAudioFileName(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}
