import { cloneElement, forwardRef, isValidElement } from 'react';
import { Tooltip } from 'antd';
import type { TooltipProps } from 'antd';
import { useCoarsePointer } from '../hooks/useCoarsePointer';

/**
 * Drop-in replacement for antd's `Tooltip` that skips rendering the tooltip entirely on
 * touch/coarse-pointer devices. Tooltips are a hover-only affordance; on touch browsers (notably
 * iOS Safari) a hover-triggered tooltip absorbs the first tap to open itself, requiring a second
 * tap on the same element for the underlying `onClick` to actually fire. Since touch users can't
 * hover in the first place, the tooltip provides no value there anyway - so we just render the
 * child directly, letting the first tap register immediately.
 *
 * Forwards refs (via forwardRef) since parents like antd's Popconfirm/Popover attach a ref to
 * their trigger child to control positioning/open state.
 */
export const TouchSafeTooltip = forwardRef<HTMLElement, TooltipProps>(function TouchSafeTooltip(
  { children, ...props },
  ref
) {
  const isTouch = useCoarsePointer();
  if (isTouch) {
    return isValidElement(children) ? cloneElement(children, { ref } as never) : children;
  }
  return (
    <Tooltip ref={ref} {...props}>
      {children}
    </Tooltip>
  );
});
