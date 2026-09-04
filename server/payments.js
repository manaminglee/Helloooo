/**
 * Stripe + Razorpay test/live checkout for Pro and IP unblock.
 */
const crypto = require('crypto');

const PRODUCTS = {
  pro: {
    name: 'Helloooo Pro (30 days)',
    amountUsd: Number(process.env.PAYMENT_PRO_USD_CENTS) || 499,
    amountInr: Number(process.env.PAYMENT_PRO_INR_PAISE) || 39900,
    days: 30,
  },
  unblock: {
    name: 'Helloooo IP Unblock',
    amountUsd: Number(process.env.PAYMENT_UNBLOCK_USD_CENTS) || 500,
    amountInr: Number(process.env.PAYMENT_UNBLOCK_INR_PAISE) || 41500,
  },
};

const { httpClientIp } = require('./clientIp');

function clientIp(req) {
  return httpClientIp(req);
}

function paymentProvider() {
  const forced = (process.env.PAYMENT_PROVIDER || 'auto').toLowerCase();
  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  const razorpayId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const razorpaySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const cashfreeId = (process.env.CASHFREE_APP_ID || '').trim();
  const cashfreeSecret = (process.env.CASHFREE_SECRET_KEY || '').trim();
  const testMode = process.env.PAYMENT_TEST_MODE === 'true';

  if (forced === 'cashfree' && cashfreeId && cashfreeSecret) {
    return { provider: 'cashfree', testMode: process.env.CASHFREE_ENV !== 'production' };
  }
  if (forced === 'stripe' && stripeKey) return { provider: 'stripe', testMode: stripeKey.startsWith('sk_test_') };
  if (forced === 'razorpay' && razorpayId && razorpaySecret) {
    return { provider: 'razorpay', testMode: razorpayId.startsWith('rzp_test_') };
  }
  if (forced === 'test' || (testMode && !stripeKey && !razorpayId)) return { provider: 'test', testMode: true };
  if (stripeKey) return { provider: 'stripe', testMode: stripeKey.startsWith('sk_test_') };
  if (razorpayId && razorpaySecret) return { provider: 'razorpay', testMode: razorpayId.startsWith('rzp_test_') };
  if (cashfreeId && cashfreeSecret) return { provider: 'cashfree', testMode: process.env.CASHFREE_ENV !== 'production' };
  if (process.env.STRIPE_PRO_URL || process.env.STRIPE_UNBLOCK_URL) return { provider: 'link', testMode: true };
  return { provider: 'none', testMode };
}

async function stripeCheckoutSession({ product, ip, successUrl, cancelUrl }) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const p = PRODUCTS[product];
  if (!secret || !p) throw new Error('Stripe not configured');

  const body = new URLSearchParams({
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(p.amountUsd),
    'line_items[0][price_data][product_data][name]': p.name,
    'metadata[product]': product,
    'metadata[ip]': ip,
  });

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Stripe session failed');
  return { checkoutUrl: data.url, sessionId: data.id };
}

async function razorpayCreateOrder({ product, ip, amountInrPaise = null, notes = null }) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const p = product ? PRODUCTS[product] : null;
  const amount = amountInrPaise != null ? amountInrPaise : p?.amountInr;
  if (!keyId || !keySecret || amount == null) throw new Error('Razorpay not configured');

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      currency: 'INR',
      notes: notes || { product: product || 'coins', ip },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.description || 'Razorpay order failed');
  return {
    orderId: data.id,
    amount: data.amount,
    currency: data.currency,
    keyId,
  };
}

function verifyRazorpaySignature(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return expected === signature;
}

async function stripeVerifySession(sessionId) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !sessionId) return null;
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const data = await res.json();
  if (!res.ok || data.payment_status !== 'paid') return null;
  return { product: data.metadata?.product, ip: data.metadata?.ip };
}

const { COIN_PACKAGES } = require('./giftCatalog');

async function cashfreeCreateOrder({ packageId, ip, audioUsername, returnUrl }) {
  const appId = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  const pack = COIN_PACKAGES.find((p) => p.id === packageId);
  if (!appId || !secret || !pack) throw new Error('Cashfree or package not configured');
  const base = process.env.CASHFREE_ENV === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
  const orderId = `mm_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const res = await fetch(`${base}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-version': '2023-08-01',
      'x-client-id': appId,
      'x-client-secret': secret,
    },
    body: JSON.stringify({
      order_id: orderId,
      order_amount: pack.priceInr,
      order_currency: 'INR',
      customer_details: {
        customer_id: String(audioUsername || ip).slice(0, 48),
        customer_email: 'voice@manamingle.local',
      },
      order_meta: {
        return_url: returnUrl,
        notify_url: returnUrl,
      },
      order_note: JSON.stringify({ packageId: pack.id, audioUsername: audioUsername || null, ip }),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error?.message || 'Cashfree order failed');
  return {
    orderId: data.order_id || orderId,
    paymentSessionId: data.payment_session_id,
    checkoutUrl: `https://${process.env.CASHFREE_ENV === 'production' ? 'payments' : 'sandbox.cashfree.com'}/pg/view/${data.payment_session_id}`,
    amount: pack.priceInr,
    packageId: pack.id,
    coins: pack.coins,
  };
}

async function cashfreeVerifyOrder(orderId) {
  const appId = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!appId || !secret || !orderId) return null;
  const base = process.env.CASHFREE_ENV === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
  const res = await fetch(`${base}/orders/${orderId}`, {
    headers: {
      'x-api-version': '2023-08-01',
      'x-client-id': appId,
      'x-client-secret': secret,
    },
  });
  const data = await res.json();
  if (!res.ok || data.order_status !== 'PAID') return null;
  let note = {};
  try { note = JSON.parse(data.order_note || '{}'); } catch { /* ignore */ }
  return { packageId: note.packageId, audioUsername: note.audioUsername, ip: note.ip };
}

function registerPayments(app, deps) {
  const { persistence, blockedIps, io, users, audioIdentity, getMarket } = deps;
  const frontend = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');

  async function fulfillCoinPackage(packageId, audioUsername, paymentMeta = {}) {
    const pack = COIN_PACKAGES.find((p) => p.id === packageId);
    if (!pack || !audioIdentity) return { ok: false, error: 'Invalid package' };
    const key = String(audioUsername || '').toLowerCase();
    if (!key) return { ok: false, error: 'Audio identity required' };
    const res = await audioIdentity.credit(key, pack.coins, `coin_pack_${pack.id}`, { packageId: pack.id, recharge: true });
    if (!res.ok) return res;
    if (paymentMeta.paymentRef) {
      await audioIdentity.recordPayment({
        paymentRef: paymentMeta.paymentRef,
        usernameKey: key,
        packageId: pack.id,
        coins: pack.coins,
        amountInr: pack.priceInr,
        provider: paymentMeta.provider || 'test',
        orderId: paymentMeta.orderId || null,
        meta: paymentMeta,
      });
    }
    try {
      const market = typeof getMarket === 'function' ? getMarket() : null;
      market?.recordPurchase?.({
        id: paymentMeta.paymentRef || undefined,
        audioUsername: key,
        packageId: pack.id,
        coins: pack.coins,
        currency: 'INR',
        amountPaid: pack.priceInr,
        provider: paymentMeta.provider || 'test',
        providerTxId: paymentMeta.orderId || paymentMeta.paymentRef || null,
        status: 'completed',
      });
    } catch (e) {
      console.warn('[payments] market record failed:', e.message);
    }
    for (const [sid, user] of users.entries()) {
      if (String(user.audioIdentity?.username || '').toLowerCase() === key) {
        user.audioIdentity = res.identity;
        io.to(sid).emit('audio-identity:ready', res.identity);
        io.to(sid).emit('coins-updated', { coins: res.balance, reason: `Recharged ${pack.name}`, audio: true });
        io.to(sid).emit('gift:pack-bought', { packageId: pack.id, coins: pack.coins, balance: res.balance });
      }
    }
    return { ok: true, coins: pack.coins, balance: res.balance, identity: res.identity };
  }

  async function fulfillPayment(product, ip) {
    if (product === 'pro') {
      const result = await persistence.grantProSubscription(ip, PRODUCTS.pro.days);
      for (const [sid, user] of users.entries()) {
        if (user.ip === ip) {
          io.to(sid).emit('pro-activated', { isPro: true, proUntil: result.proUntil });
        }
      }
      return { ok: true, product: 'pro', proUntil: result.proUntil };
    }
    if (product === 'unblock') {
      blockedIps.delete(ip);
      for (const [sid, user] of users.entries()) {
        if (user.ip === ip) {
          io.to(sid).emit('ip-unblocked', { message: 'Payment received — access restored.' });
        }
      }
      return { ok: true, product: 'unblock' };
    }
    return { ok: false, error: 'Unknown product' };
  }

  app.get('/api/payment/config', (_req, res) => {
    const { provider, testMode } = paymentProvider();
    res.json({
      provider,
      testMode,
      products: PRODUCTS,
      stripePublishableKey: (process.env.STRIPE_PUBLISHABLE_KEY || '').trim() || null,
      razorpayKeyId: (process.env.RAZORPAY_KEY_ID || '').trim() || null,
      cashfreeAppId: (process.env.CASHFREE_APP_ID || '').trim() || null,
      coinPackages: COIN_PACKAGES,
      currency: provider === 'razorpay' || provider === 'cashfree' ? 'INR' : 'USD',
    });
  });

  app.post('/api/payment/create-intent', async (req, res) => {
    const product = String(req.body?.product || 'pro');
    if (!PRODUCTS[product]) return res.status(400).json({ error: 'Invalid product' });

    const ip = clientIp(req);
    const { provider, testMode } = paymentProvider();

    try {
      if (provider === 'test') {
        return res.json({
          provider: 'test',
          testMode: true,
          product,
          message: 'Test mode — no real charge. Confirm to simulate payment.',
          amountLabel: product === 'pro' ? '$4.99 (simulated)' : '$5.00 (simulated)',
        });
      }

      if (provider === 'link') {
        const url = product === 'pro'
          ? (process.env.STRIPE_PRO_URL || '').trim()
          : (process.env.STRIPE_UNBLOCK_URL || '').trim();
        if (url) return res.json({ provider: 'link', checkoutUrl: url, testMode: true });
        return res.status(503).json({ error: 'Payment link not configured' });
      }

      if (provider === 'stripe') {
        const successUrl = `${frontend}/?payment=success&product=${product}&session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${frontend}/?payment=cancel&product=${product}`;
        const session = await stripeCheckoutSession({ product, ip, successUrl, cancelUrl });
        return res.json({ provider: 'stripe', testMode, ...session });
      }

      if (provider === 'razorpay') {
        const order = await razorpayCreateOrder({ product, ip });
        return res.json({
          provider: 'razorpay',
          testMode,
          product,
          ...order,
          name: 'Helloooo',
          description: PRODUCTS[product].name,
          prefill: {},
        });
      }

      return res.status(503).json({
        error: 'Payments not configured',
        message: 'Set STRIPE_SECRET_KEY, RAZORPAY_KEY_ID, CASHFREE_APP_ID, or PAYMENT_TEST_MODE=true',
      });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Payment setup failed' });
    }
  });

  app.post('/api/payment/coins/create-order', async (req, res) => {
    const packageId = String(req.body?.packageId || '');
    const audioUsername = String(req.body?.audioUsername || '').trim();
    const pack = COIN_PACKAGES.find((p) => p.id === packageId);
    if (!pack) return res.status(400).json({ error: 'Invalid coin package' });
    if (!audioUsername) return res.status(400).json({ error: 'Sign in to your voice identity first' });
    const ip = clientIp(req);
    const { provider, testMode } = paymentProvider();
    const returnUrl = `${frontend}/?payment=coins&package=${packageId}&audio=${encodeURIComponent(audioUsername)}`;

    try {
      if (provider === 'test' || process.env.PAYMENT_TEST_MODE === 'true') {
        return res.json({
          provider: 'test',
          testMode: true,
          packageId,
          coins: pack.coins,
          amountLabel: `₹${pack.priceInr} (simulated)`,
          message: 'Test mode — confirm to credit coins instantly.',
        });
      }
      if (provider === 'cashfree') {
        const order = await cashfreeCreateOrder({ packageId, ip, audioUsername, returnUrl });
        return res.json({ provider: 'cashfree', testMode, ...order });
      }
      if (provider === 'razorpay') {
        const order = await razorpayCreateOrder({
          product: null,
          ip,
          amountInrPaise: Math.round(Number(pack.priceInr) * 100),
          notes: {
            product: 'coins',
            packageId: pack.id,
            audioUsername,
            ip,
          },
        });
        return res.json({
          provider: 'razorpay',
          testMode,
          packageId: pack.id,
          coins: pack.coins,
          audioUsername,
          name: 'Helloooo',
          description: `${pack.name} · ${pack.coins} Nuts`,
          ...order,
        });
      }
      return res.status(503).json({
        error: 'Coin checkout not configured — set RAZORPAY_KEY_ID, CASHFREE_APP_ID, or PAYMENT_TEST_MODE=true',
      });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Order failed' });
    }
  });

  app.post('/api/payment/coins/verify', async (req, res) => {
    const orderId = String(req.body?.orderId || '');
    const packageId = String(req.body?.packageId || '');
    const audioUsername = String(req.body?.audioUsername || '');
    const ref = `cashfree:${orderId || packageId}:${audioUsername}`;
    if (persistence.hasConsumedPayment?.(ref)) {
      return res.json({ ok: true, alreadyProcessed: true });
    }
    try {
      if (process.env.PAYMENT_TEST_MODE === 'true' && req.body?.testConfirm) {
        const result = await fulfillCoinPackage(packageId, audioUsername, {
          paymentRef: ref,
          provider: 'test',
          orderId: null,
        });
        if (result.ok) {
          await persistence.markPaymentConsumed?.(ref, { provider: 'test', packageId, usernameKey: String(audioUsername).toLowerCase() });
        }
        return res.json(result);
      }
      const meta = await cashfreeVerifyOrder(orderId);
      if (!meta?.packageId) return res.status(400).json({ ok: false, error: 'Payment not completed' });
      const payRef = `cashfree:${orderId}`;
      const result = await fulfillCoinPackage(meta.packageId, meta.audioUsername || audioUsername, {
        paymentRef: payRef,
        provider: 'cashfree',
        orderId,
      });
      if (result.ok) {
        await persistence.markPaymentConsumed?.(payRef, {
          provider: 'cashfree',
          packageId: meta.packageId,
          usernameKey: String(meta.audioUsername || audioUsername).toLowerCase(),
        });
      }
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/payment/test-complete', async (req, res) => {
    if (process.env.PAYMENT_TEST_MODE !== 'true' && paymentProvider().provider !== 'test') {
      return res.status(403).json({ error: 'Test payments disabled' });
    }
    const product = String(req.body?.product || 'pro');
    if (!PRODUCTS[product]) return res.status(400).json({ error: 'Invalid product' });
    const result = await fulfillPayment(product, clientIp(req));
    res.json({ ...result, testMode: true });
  });

  app.post('/api/payment/verify-razorpay', async (req, res) => {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      product,
      packageId,
      audioUsername,
    } = req.body || {};
    if (!verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
      return res.status(400).json({ ok: false, error: 'Invalid payment signature' });
    }
    // Idempotency: a consumed payment id can never be replayed for a second grant.
    const ref = `razorpay:${razorpay_payment_id}`;
    if (persistence.hasConsumedPayment?.(ref)) {
      return res.json({
        ok: true,
        alreadyProcessed: true,
        product: String(product || (packageId ? 'coins' : 'pro')),
      });
    }

    // Nuts coin packs
    if (packageId || product === 'coins') {
      const result = await fulfillCoinPackage(String(packageId || ''), String(audioUsername || ''), {
        paymentRef: ref,
        provider: 'razorpay',
        orderId: razorpay_order_id,
      });
      if (result.ok) {
        await persistence.markPaymentConsumed?.(ref, {
          provider: 'razorpay',
          product: 'coins',
          packageId,
          audioUsername,
        });
      }
      return res.json(result);
    }

    const result = await fulfillPayment(String(product || 'pro'), clientIp(req));
    if (result.ok) await persistence.markPaymentConsumed?.(ref, { provider: 'razorpay', product: String(product || 'pro') });
    res.json(result);
  });

  app.get('/api/payment/verify-stripe', async (req, res) => {
    const sessionId = String(req.query.session_id || '');
    const meta = await stripeVerifySession(sessionId);
    if (!meta?.product) return res.status(400).json({ ok: false, error: 'Payment not completed' });
    // Idempotency: a consumed checkout session can never be replayed for a second grant.
    const ref = `stripe:${sessionId}`;
    if (persistence.hasConsumedPayment?.(ref)) {
      return res.json({ ok: true, alreadyProcessed: true, product: meta.product });
    }
    const ip = meta.ip || clientIp(req);
    const result = await fulfillPayment(meta.product, ip);
    if (result.ok) await persistence.markPaymentConsumed?.(ref, { provider: 'stripe', product: meta.product });
    res.json(result);
  });

  // Legacy unblock endpoint
  app.post('/api/payment/unblock-intent', async (req, res) => {
    req.body = { ...req.body, product: 'unblock' };
    const ip = clientIp(req);
    const { provider, testMode } = paymentProvider();
    try {
      if (provider === 'test') {
        return res.json({ provider: 'test', testMode: true, product: 'unblock', message: 'Test mode unblock available' });
      }
      if (provider === 'stripe') {
        const successUrl = `${frontend}/?payment=success&product=unblock&session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${frontend}/?payment=cancel&product=unblock`;
        const session = await stripeCheckoutSession({ product: 'unblock', ip, successUrl, cancelUrl });
        return res.json({ checkoutUrl: session.checkoutUrl, provider: 'stripe', testMode });
      }
      if (provider === 'razorpay') {
        const order = await razorpayCreateOrder({ product: 'unblock', ip });
        return res.json({ provider: 'razorpay', testMode, product: 'unblock', ...order, name: 'Helloooo', description: PRODUCTS.unblock.name });
      }
      const stripeUrl = (process.env.STRIPE_UNBLOCK_URL || '').trim();
      if (stripeUrl) return res.json({ checkoutUrl: stripeUrl, message: 'Redirecting to secure checkout...' });
      return res.json({ message: 'Online payment is not configured. Email manaminglee@gmail.com with your blocked IP to appeal or pay manually.' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { registerPayments, PRODUCTS };
