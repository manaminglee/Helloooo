/**
 * Client checkout helper — Stripe redirect, Razorpay modal, or test simulation.
 */
import { API_BASE } from '../config/apiBase';

function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(window.Razorpay);
    s.onerror = () => reject(new Error('Could not load Razorpay'));
    document.body.appendChild(s);
  });
}

export async function startPayment(product, { onSuccess, onError } = {}) {
  const res = await fetch(`${API_BASE}/api/payment/create-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ product }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || 'Payment unavailable');

  if (data.provider === 'stripe' && data.checkoutUrl) {
    window.location.href = data.checkoutUrl;
    return data;
  }

  if (data.provider === 'link' && data.checkoutUrl) {
    window.location.href = data.checkoutUrl;
    return data;
  }

  if (data.provider === 'test' && data.testMode) {
    const ok = window.confirm(
      `Test payment (no real charge)\n\nProduct: ${product === 'pro' ? 'Helloooo Pro' : 'IP Unblock'}\n${data.amountLabel || ''}\n\nSimulate successful payment?`
    );
    if (!ok) return data;
    const complete = await fetch(`${API_BASE}/api/payment/test-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ product }),
    });
    const result = await complete.json();
    if (!complete.ok || !result.ok) throw new Error(result.error || 'Test payment failed');
    onSuccess?.(result);
    return result;
  }

  if (data.provider === 'razorpay') {
    const Razorpay = await loadRazorpayScript();
    return new Promise((resolve, reject) => {
      const rzp = new Razorpay({
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: data.name || 'Helloooo',
        description: data.description,
        order_id: data.orderId,
        theme: { color: '#6366f1' },
        handler: async (response) => {
          try {
            const verify = await fetch(`${API_BASE}/api/payment/verify-razorpay`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                product,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const result = await verify.json();
            if (!verify.ok || !result.ok) throw new Error(result.error || 'Verification failed');
            onSuccess?.(result);
            resolve(result);
          } catch (e) {
            onError?.(e);
            reject(e);
          }
        },
        modal: {
          ondismiss: () => reject(new Error('Payment cancelled')),
        },
      });
      rzp.open();
    });
  }

  throw new Error(data.message || 'Payment provider not configured');
}

export async function verifyStripeReturn(searchParams) {
  const payment = searchParams.get('payment');
  const sessionId = searchParams.get('session_id');
  const product = searchParams.get('product');
  if (payment !== 'success' || !sessionId) return null;

  const res = await fetch(`${API_BASE}/api/payment/verify-stripe?session_id=${encodeURIComponent(sessionId)}`, {
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'Stripe verification failed');
  return { ...data, product };
}

export async function fetchPaymentConfig() {
  const res = await fetch(`${API_BASE}/api/payment/config`, { credentials: 'include' });
  if (!res.ok) return null;
  return res.json();
}
