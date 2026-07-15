import { useEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import type { ButtonSize } from 'antd/es/button';
import { CloseOutlined, DeleteOutlined } from '@ant-design/icons';

interface InlineDeleteButtonProps {
  onConfirm: () => void | Promise<void>;
  /** aria-label for the initial trash icon button */
  ariaLabel?: string;
  /** Label on the danger confirm button (default: "Delete") */
  confirmText?: string;
  size?: ButtonSize;
}

const AUTO_RESET_MS = 3000;

/**
 * A delete control that confirms inline — no floating Popconfirm overlay.
 *
 * First click: icon button morphs into [ ✕ ] [ Delete ] in the same spot.
 * Second click on Delete: calls onConfirm(). ✕ or a 3 s timeout resets it.
 * All click events call stopPropagation so it is safe inside selectable cards.
 */
export function InlineDeleteButton({
  onConfirm,
  ariaLabel = 'Delete',
  confirmText = 'Delete',
  size = 'small'
}: InlineDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!confirming) return;
    timerRef.current = setTimeout(() => setConfirming(false), AUTO_RESET_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [confirming]);

  function arm(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirming(true);
  }

  function cancel(e: React.MouseEvent) {
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    setConfirming(false);
  }

  async function confirm(e: React.MouseEvent) {
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    setConfirming(false);
    await onConfirm();
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button
          size={size}
          type="text"
          icon={<CloseOutlined />}
          aria-label="Cancel delete"
          onClick={cancel}
        />
        <Button
          size={size}
          danger
          onClick={confirm}
          aria-label={confirmText}
        >
          {confirmText}
        </Button>
      </span>
    );
  }

  return (
    <Button
      size={size}
      type="text"
      danger
      shape="circle"
      icon={<DeleteOutlined />}
      aria-label={ariaLabel}
      onClick={arm}
    />
  );
}
