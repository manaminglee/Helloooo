import { useCallback, useEffect, useRef, useState } from 'react';

const CORNERS = ['tl', 'tr', 'bl', 'br'];
const EDGE_PAD = 10;

function cornerStyles(corner) {
  switch (corner) {
    case 'tl':
      return { top: EDGE_PAD, left: EDGE_PAD, right: 'auto', bottom: 'auto' };
    case 'tr':
      return { top: EDGE_PAD, right: EDGE_PAD, left: 'auto', bottom: 'auto' };
    case 'bl':
      return { bottom: EDGE_PAD, left: EDGE_PAD, top: 'auto', right: 'auto' };
    default:
      return { bottom: EDGE_PAD, right: EDGE_PAD, top: 'auto', left: 'auto' };
  }
}

function nearestCorner(clientX, clientY, bounds, pipW, pipH) {
  const cx = clientX;
  const cy = clientY;
  const midX = bounds.left + bounds.width / 2;
  const midY = bounds.top + bounds.height / 2;
  const h = cx < midX ? 'l' : 'r';
  const v = cy < midY ? 't' : 'b';
  return `${v}${h}`;
}

/**
 * Square picture-in-picture overlay that snaps to four corners after drag.
 */
export function DraggableVideoPip({
  position = 'br',
  onPositionChange,
  onCycleCorner,
  size = 'md',
  hidden = false,
  children,
  className = '',
  label,
}) {
  const pipRef = useRef(null);
  const dragRef = useRef(null);
  const lastTapRef = useRef(0);
  const movedRef = useRef(false);
  const [dragOffset, setDragOffset] = useState(null);

  if (hidden) return null;

  const sizeClass = size === 'sm' ? 'mm-video-pip--sm' : size === 'lg' ? 'mm-video-pip--lg' : '';

  const finishDrag = useCallback((clientX, clientY) => {
    const pip = pipRef.current;
    const parent = pip?.offsetParent;
    if (!pip || !parent) {
      setDragOffset(null);
      dragRef.current = null;
      return;
    }
    const bounds = parent.getBoundingClientRect();
    const pipRect = pip.getBoundingClientRect();
    const corner = nearestCorner(
      clientX || pipRect.left + pipRect.width / 2,
      clientY || pipRect.top + pipRect.height / 2,
      bounds,
      pipRect.width,
      pipRect.height
    );
    if (corner !== position && onPositionChange) onPositionChange(corner);
    setDragOffset(null);
    dragRef.current = null;
  }, [onPositionChange, position]);

  const onPointerDown = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const pip = pipRef.current;
    const parent = pip?.offsetParent;
    if (!pip || !parent) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pipRect = pip.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      offsetX: e.clientX - pipRect.left,
      offsetY: e.clientY - pipRect.top,
      parentRect: parent.getBoundingClientRect(),
      pipW: pipRect.width,
      pipH: pipRect.height,
    };
    movedRef.current = false;
    setDragOffset({
      x: pipRect.left - parent.getBoundingClientRect().left,
      y: pipRect.top - parent.getBoundingClientRect().top,
    });
  }, []);

  const onPointerMove = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    const maxX = drag.parentRect.width - drag.pipW - EDGE_PAD;
    const maxY = drag.parentRect.height - drag.pipH - EDGE_PAD;
    const x = Math.min(maxX, Math.max(EDGE_PAD, e.clientX - drag.parentRect.left - drag.offsetX));
    const y = Math.min(maxY, Math.max(EDGE_PAD, e.clientY - drag.parentRect.top - drag.offsetY));
    movedRef.current = true;
    setDragOffset({ x, y });
  }, []);

  const onPointerUp = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
    if (!movedRef.current) {
      const now = Date.now();
      if (now - lastTapRef.current < 320) {
        onCycleCorner?.();
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;
    }
    finishDrag(e.clientX, e.clientY);
  }, [finishDrag]);

  useEffect(() => {
    const onCancel = () => {
      if (dragRef.current) finishDrag();
    };
    window.addEventListener('pointercancel', onCancel);
    return () => window.removeEventListener('pointercancel', onCancel);
  }, [finishDrag]);

  const baseCorner = cornerStyles(CORNERS.includes(position) ? position : 'br');
  const style = dragOffset
    ? {
        top: dragOffset.y,
        left: dragOffset.x,
        right: 'auto',
        bottom: 'auto',
        transition: 'none',
      }
    : { ...baseCorner, transition: 'top 0.22s ease, left 0.22s ease, right 0.22s ease, bottom 0.22s ease' };

  return (
    <div
      ref={pipRef}
      className={`mm-video-pip absolute z-[85] touch-none select-none ${sizeClass} ${className}`}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="presentation"
      aria-label={label || 'Your camera preview — drag to move'}
    >
      <div className="mm-video-pip-inner relative w-full h-full overflow-hidden bg-black shadow-[0_8px_32px_rgba(0,0,0,0.55)] ring-2 ring-violet-500/35">
        {children}
      </div>
      <div className="mm-video-pip-grip absolute top-1 right-1 w-5 h-5 rounded-md bg-black/50 border border-white/15 flex items-center justify-center pointer-events-none">
        <svg className="w-3 h-3 text-white/50" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="16" cy="8" r="1.5" />
          <circle cx="8" cy="16" r="1.5" />
          <circle cx="16" cy="16" r="1.5" />
        </svg>
      </div>
    </div>
  );
}
