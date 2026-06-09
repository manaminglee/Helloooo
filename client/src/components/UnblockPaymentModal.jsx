import { useState } from 'react';

const API = import.meta.env.VITE_SOCKET_URL || '';

export function UnblockPaymentModal({ open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  if (!open) return null;

  const startPayment = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API}/api/payment/unblock-intent`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setMessage(data.message || 'Payment link is not configured yet. Email manaminglee@gmail.com with your IP to appeal.');
    } catch {
      setMessage('Could not start payment. Contact support at manaminglee@gmail.com');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/80">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161a22] p-6">
        <h3 className="text-lg font-semibold text-white mb-2">Unblock your access</h3>
        <p className="text-sm text-white/50 mb-4">
          Pay the $5.00 verification fee to restore access, or contact support if this was a mistake.
        </p>
        {message && <p className="text-sm text-amber-300 mb-4">{message}</p>}
        <div className="flex flex-col gap-2">
          <button type="button" disabled={loading} onClick={startPayment} className="min-h-[48px] rounded-xl bg-emerald-500 text-black font-medium disabled:opacity-50">
            {loading ? 'Loading...' : 'Pay $5.00 to unblock'}
          </button>
          <a href="mailto:manaminglee@gmail.com" className="min-h-[44px] flex items-center justify-center rounded-xl border border-white/15 text-sm text-white/70">
            Email support instead
          </a>
          <button type="button" onClick={onClose} className="min-h-[44px] text-sm text-white/40">Close</button>
        </div>
      </div>
    </div>
  );
}
