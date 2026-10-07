/** Shared boot / splash screen — matches index.html pre-React loader. */
export function BootScreen({ hint = 'Loading' }) {
  return (
    <div className="boot-screen" role="status" aria-live="polite" aria-label="Helloooo loading">
      <div className="boot-screen__stage" aria-hidden>
        <div className="boot-screen__ring">
          <div className="boot-screen__orbit" />
          <div className="boot-screen__orbit boot-screen__orbit--inner" />
          <div className="boot-screen__core">
            <img
              className="boot-screen__logo"
              src="/helloooo-logo.png"
              alt=""
              width={44}
              height={44}
              decoding="async"
            />
          </div>
        </div>
      </div>
      <p className="boot-screen__brand">
        <span className="boot-screen__brand-hell">Hell</span>
        <span className="boot-screen__brand-o">oooo</span>
      </p>
      <div className="boot-screen__progress" aria-hidden>
        <span className="boot-screen__progress-bar" />
      </div>
      <p className="boot-screen__hint">
        {hint}
        <span className="boot-screen__dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </p>
    </div>
  );
}
