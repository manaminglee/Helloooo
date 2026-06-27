import { useState } from 'react';
import { startPayment } from '../utils/paymentCheckout';

export function UnblockPaymentModal({ open, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  if (!open) return null;

  const startPay = async () => {
    setLoading(true);
    setMessage('');
    try {
      await startPayment('unblock', {
        onSuccess: (result) => {
          setMessage(result.testMode ? 'Test payment OK — access restored.' : 'Payment successful — access restored.');
          onSuccess?.(result);
          setTimeout(() => onClose(), 1500);
        },
      });
    } catch (e) {
      if (e.message === 'Payment cancelled') {
        setMessage('Payment cancelled.');
      } else {
        setMessage(e.message || 'Could not start payment. Contact support at manaminglee@gmail.com');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/80">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161a22] p-6">
        <h3 className="text-lg font-semibold text-white mb-2">Unblock your access</h3>
        <p className="text-sm text-white/50 mb-4">
          Pay the verification fee to restore access. Test mode available when configured — no real charge in dev.
        </p>
        {message && <p className="text-sm text-amber-300 mb-4">{message}</p>}
        <div className="flex flex-col gap-2">
          <button type="button" disabled={loading} onClick={() => startPay()} className="min-h-[48px] rounded-xl bg-emerald-500 text-black font-medium disabled:opacity-50">
            {loading ? 'Loading…' : 'Pay to unblock (Stripe / Razorpay / Test)'}
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
