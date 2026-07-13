function formatUtcTimestamp(timestampIso: string): string | null {
  const parsed = new Date(timestampIso);
  if (Number.isNaN(parsed.getTime())) return null;

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  const hours = String(parsed.getUTCHours()).padStart(2, '0');
  const minutes = String(parsed.getUTCMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

export function getBuildStampLabel(): string | null {
  const timestamp = import.meta.env.VITE_BUILD_TIMESTAMP;
  const commitSha = import.meta.env.VITE_BUILD_COMMIT_SHA;

  if (!timestamp || !commitSha) return null;

  const formattedTimestamp = formatUtcTimestamp(timestamp);
  if (!formattedTimestamp) return null;

  return `Build: ${formattedTimestamp} · ${commitSha.slice(0, 7)}`;
}
