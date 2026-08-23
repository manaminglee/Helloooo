import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AdminDashboard } from './components/AdminDashboard';
import { isChunkLoadError } from './utils/lazyRetry';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, reloading: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error) {
    if (isChunkLoadError(error)) {
      try {
        if (!sessionStorage.getItem('helloooo_chunk_reload')) {
          sessionStorage.setItem('helloooo_chunk_reload', '1');
          this.setState({ reloading: true });
          window.location.reload();
        }
      } catch {
        /* ignore */
      }
    }
  }

  handleReload = () => {
    try {
      sessionStorage.removeItem('helloooo_chunk_reload');
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const chunkErr = isChunkLoadError(this.state.error);
      let alreadyTriedReload = false;
      try {
        alreadyTriedReload = !!sessionStorage.getItem('helloooo_chunk_reload');
      } catch {
        /* ignore */
      }

      if (this.state.reloading) {
        return (
          <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#07060f', color: '#c084fc', fontFamily: 'system-ui,sans-serif', padding: 24, textAlign: 'center' }}>
            <p>App updated — reloading…</p>
          </div>
        );
      }

      return (
        <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#07060f', color: '#fff', fontFamily: 'system-ui,sans-serif', padding: 24, textAlign: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: chunkErr ? '#c084fc' : '#f87171' }}>
            {chunkErr ? 'App updated' : 'Something went wrong'}
          </h2>
          <p style={{ margin: 0, maxWidth: 360, color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 1.5 }}>
            {chunkErr
              ? alreadyTriedReload
                ? 'Still failing after reload. Hard refresh (Ctrl+Shift+R) or clear site data for helloooo.site.'
                : 'A newer version of Helloooo is available. Reload to continue.'
              : 'An unexpected error occurred. Try reloading the page.'}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{ marginTop: 8, padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#c084fc,#2563eb)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
          >
            Reload
          </button>
          {!chunkErr && (
            <pre style={{ marginTop: 16, maxWidth: '100%', overflow: 'auto', color: '#f87171', fontSize: 11, textAlign: 'left' }}>
              {String(this.state.error)}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

const path = window.location.pathname || '/';

// Service worker: versioned cache (bump CACHE in public/sw.js when deploying breaking changes)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
} else if ('serviceWorker' in navigator && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  }).catch(() => {});
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {path.startsWith('/admin') ? <AdminDashboard /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
