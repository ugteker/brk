const FORMAT_HUE: Record<string, number> = {
  free_form: 212, // #1677ff
  structured: 266, // #722ed1
  hosted: 30, // #fa8c16
  hybrid: 228 // #2f54eb
};

function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}

// ponytail: mulberry32 — plenty of randomness for decorative art
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic procedural cover for a synthetic discussion: aurora blobs in the
 * format's palette plus a seeded waveform, drawn as inline SVG. Same discussion
 * always renders the same cover. Purely decorative.
 */
export function DiscussionCover({
  id,
  format,
  className
}: {
  id: string;
  format: string;
  className?: string;
}) {
  const rand = prng(hash(id));
  const baseHue = FORMAT_HUE[format] ?? 266;

  const blobs = Array.from({ length: 4 }, (_, i) => ({
    cx: 10 + rand() * 80,
    cy: 10 + rand() * 80,
    r: 25 + rand() * 30,
    hue: (baseHue + (rand() - 0.5) * 90 + 360) % 360,
    opacity: 0.35 + rand() * 0.3,
    key: i
  }));

  // Seeded waveform across the middle
  const points = Array.from({ length: 12 }, (_, i) => {
    const x = (i / 11) * 100;
    const y = 55 + (rand() - 0.5) * 40;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="100" height="100" fill={`hsl(${baseHue} 45% 14%)`} />
      <g filter="url(#dc-blur)">
        {blobs.map((b) => (
          <circle
            key={b.key}
            cx={b.cx}
            cy={b.cy}
            r={b.r}
            fill={`hsl(${b.hue.toFixed(0)} 80% 60%)`}
            opacity={b.opacity}
          />
        ))}
      </g>
      <polyline
        points={points}
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* readability fade for the avatar stack sitting at the bottom */}
      <rect y="55" width="100" height="45" fill="url(#dc-fade)" />
      <defs>
        <filter id="dc-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <linearGradient id="dc-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(0,0,0,0.45)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
