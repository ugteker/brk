import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface GhostCreateCardProps {
  ariaLabel: string;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  sub?: string;
  className?: string;
  attention?: boolean;
}

const baseClasses = `group relative flex min-h-[170px] flex-col items-center justify-center
                   rounded-lg p-4 text-center text-sky-700 transition-all
                   hover:text-sky-600 dark:text-sky-300 dark:hover:text-sky-200`;

export function GhostCreateCard({
  ariaLabel,
  onClick,
  icon,
  title,
  sub,
  className,
  attention = false
}: GhostCreateCardProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(baseClasses, attention && 'library-next-action', className)}
    >
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <rect
          x="1" y="1"
          width="calc(100% - 2px)" height="calc(100% - 2px)"
          rx="9" ry="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="6 4"
          className="ghost-create-card-dash transition-opacity group-hover:!opacity-100"
        />
      </svg>
      <span className="relative z-10 flex flex-col items-center gap-2">
        <span className="text-3xl transition-transform group-hover:scale-110">{icon}</span>
        <span className="text-sm font-semibold">{title}</span>
        {sub !== undefined ? <span className="text-xs opacity-70">{sub}</span> : null}
      </span>
    </button>
  );
}
