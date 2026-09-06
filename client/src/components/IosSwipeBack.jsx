import { useIosSwipeBack } from '../hooks/useIosSwipeBack';

export function IosSwipeBack({ enabled = true, onBack, children }) {
  const { ref, offset, dragging } = useIosSwipeBack(enabled, onBack);
  return (
    <div
      ref={ref}
      className={`ios-swipe${dragging ? ' is-dragging' : ''}`}
      style={{
        transform: offset ? `translate3d(${offset}px,0,0)` : undefined,
        boxShadow: offset ? `-12px 0 40px rgba(0,0,0,${Math.min(0.35, offset / 400)})` : undefined,
      }}
    >
      <span className="ios-swipe__edge" aria-hidden />
      {children}
    </div>
  );
}
