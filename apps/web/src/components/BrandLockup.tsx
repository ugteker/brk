interface BrandLockupProps {
  size?: number;
  textSize?: number;
  textColor?: string;
  className?: string;
  inverse?: boolean;
}

export function BrandLockup({
  size = 40,
  textSize,
  textColor = 'currentColor',
  className,
  inverse = false
}: BrandLockupProps) {
  return (
    <span
      className={`inline-flex items-center ${className ?? ''}`}
      style={{ gap: Math.max(8, size * 0.2) }}
    >
      <img
        src="/maydoz-logo.png"
        alt="Maydoz"
        width={size}
        height={size}
        style={{
          display: 'block',
          filter: inverse ? 'brightness(0) invert(1)' : undefined,
          flexShrink: 0,
          objectFit: 'contain',
          opacity: inverse ? 0.92 : 1
        }}
      />
      <span
        style={{
          color: textColor,
          fontSize: textSize ?? Math.max(20, Math.round(size * 0.58)),
          fontWeight: 700,
          letterSpacing: '-0.03em',
          lineHeight: 1
        }}
      >
        Maydoz
      </span>
    </span>
  );
}
