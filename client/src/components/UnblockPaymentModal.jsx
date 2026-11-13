import { useEffect, useState } from 'react';
import { startPayment } from '../utils/paymentCheckout';
import { MotionDialog } from '../motion/MotionDialog';

export function UnblockPaymentModal({ open, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) {
      setMessage('');
      setFailed(false);
      setLoading(false);
    }
  }, [open]);

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
        setFailed(false);
        setMessage('Payment cancelled.');
      } else {
        setFailed(true);
        setMessage(e.message || 'Could not start payment. Contact support at manaminglee@gmail.com');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <MotionDialog
      open={open}
      onClose={loading ? undefined : onClose}
      closeOnBackdrop={!loading}
      overlayClassName="z-[3000]"
      className="mm-modal-surface max-w-md"
      titleId="unblock-title"
    >
        <h3 id="unblock-title" className="text-lg font-semibold text-white mb-2">Unblock your access</h3>
        <p className="text-sm text-white/60 mb-4">
          Pay the verification fee to restore access. Test mode is available when configured, with no real charge in development.
        </p>
        {message && <p className="text-sm text-amber-200 mb-4" role={failed ? 'alert' : 'status'}>{message}</p>}
        <div className="flex flex-col gap-2">
          <button type="button" disabled={loading} onClick={() => startPay()} className="min-h-[48px] rounded-xl bg-emerald-500 text-black font-medium disabled:opacity-50">
            {loading ? 'Loading…' : 'Pay to unblock (Stripe / Razorpay / Test)'}
          </button>
          <a href="mailto:manaminglee@gmail.com" className="min-h-[44px] flex items-center justify-center rounded-xl border border-white/15 text-sm text-white/70">
            Email support instead
          </a>
          <button type="button" onClick={onClose} disabled={loading} className="min-h-[44px] text-sm text-white/50 disabled:opacity-40">Close</button>
        </div>
    </MotionDialog>
  );
}
