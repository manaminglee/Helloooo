/**
 * Creator verification — the blue badge — with OPTIONAL identity checks.
 *
 * Modes, set with KYC_MODE:
 *   off       (default) No identity checks at all. The badge is granted by an
 *             admin on whatever basis the operator chooses. Nothing personal
 *             is collected or stored.
 *   manual    A creator can request review. We store the REQUEST and the
 *             decision — never a document. Operators who want to see ID do it
 *             out of band and record only the verdict here.
 *   provider  An external identity provider (Persona, Onfido, Digio, …) runs
 *             the check. We store their opaque reference and their verdict.
 *
 * Why no document storage in any mode: holding scans of government ID makes you
 * a custodian of exactly the data attackers want most, and in most
 * jurisdictions triggers retention, deletion and breach-notification duties
 * that a chat product should not take on. Providers exist to carry that risk.
 *
 * The badge itself is independent of the mode, so verification can be turned on
 * later without migrating anyone.
 */
const crypto = require('crypto');

const MODES = new Set(['off', 'manual', 'provider']);

function registerCreatorKyc(app, io, deps) {
  const {
    supabase,
    localDb,
    saveLocalDb,
    sanitize,
    getCreatorForRequest,
    isAdminRequest,
    audit,
    notifyCreatorAction,
  } = deps;

  const MODE = MODES.has(String(process.env.KYC_MODE || '').trim())
    ? String(process.env.KYC_MODE).trim()
    : 'off';
  const PROVIDER = String(process.env.KYC_PROVIDER || '').trim() || null;
  const WEBHOOK_SECRET = String(process.env.KYC_WEBHOOK_SECRET || '').trim() || null;

  function ensureShape() {
    if (!localDb.creator_kyc) localDb.creator_kyc = [];
    return localDb.creator_kyc;
  }

  const creators = () => (localDb.creators || []);

  async function findCreatorById(id) {
    if (supabase) {
      const { data } = await supabase.from('creators').select('*').eq('id', id).maybeSingle();
      if (data) return data;
    }
    return creators().find((c) => c.id === id) || null;
  }

  async function latestFor(creatorId) {
    if (supabase) {
      try {
        const { data } = await supabase.from('mm_creator_kyc').select('*')
          .eq('creator_id', creatorId)
          .order('submitted_at', { ascending: false }).limit(1);
        if (data?.length) return data[0];
      } catch { /* fall through */ }
    }
    return ensureShape()
      .filter((r) => r.creator_id === creatorId)
      .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0] || null;
  }

  async function saveRequest(row) {
    ensureShape();
    const i = localDb.creator_kyc.findIndex((r) => r.id === row.id);
    if (i >= 0) localDb.creator_kyc[i] = row; else localDb.creator_kyc.push(row);
    saveLocalDb?.();
    if (supabase) {
      try { await supabase.from('mm_creator_kyc').upsert(row); } catch { /* local is enough */ }
    }
  }

  /** Flip the badge. Reused by manual review, provider webhook and admin. */
  async function setVerified(creator, verified, reason, reviewer) {
    const patch = {
      verified: !!verified,
      verified_at: verified ? new Date().toISOString() : null,
      kyc_status: verified ? 'approved' : 'rejected',
    };
    if (supabase) {
      try { await supabase.from('creators').update(patch).eq('id', creator.id); } catch { /* */ }
    }
    const row = creators().find((c) => c.id === creator.id);
    if (row) { Object.assign(row, patch); saveLocalDb?.(); }
    Object.assign(creator, patch);

    audit?.('creator_verified', { creatorId: creator.id, verified: !!verified, reviewer, reason });
    try {
      await notifyCreatorAction?.(creator, verified ? 'verified' : 'verification_rejected', reason || '');
    } catch { /* notification is best-effort */ }
    return patch;
  }

  // -------------------------------------------------------------------------
  // Public status — the client uses this to decide whether to offer the flow.
  // -------------------------------------------------------------------------
  app.get('/api/creators/kyc/config', (_req, res) => {
    res.json({
      ok: true,
      mode: MODE,
      enabled: MODE !== 'off',
      provider: MODE === 'provider' ? PROVIDER : null,
      // Stated plainly so the UI can tell creators what actually happens.
      storesDocuments: false,
    });
  });

  app.get('/api/creators/kyc/status', async (req, res) => {
    try {
      const { creator, via } = await getCreatorForRequest(req);
      if (!creator || via !== 'session') {
        return res.status(401).json({ ok: false, error: 'Creator login required' });
      }
      const latest = await latestFor(creator.id);
      res.json({
        ok: true,
        mode: MODE,
        verified: !!creator.verified,
        status: latest?.status || creator.kyc_status || 'none',
        reason: latest?.reason || null,
        submittedAt: latest?.submitted_at || null,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Status failed' });
    }
  });

  // -------------------------------------------------------------------------
  // Start a check
  // -------------------------------------------------------------------------
  app.post('/api/creators/kyc/start', async (req, res) => {
    try {
      if (MODE === 'off') {
        return res.status(503).json({
          ok: false,
          error: 'Identity verification is not enabled on this platform.',
        });
      }
      const { creator, via } = await getCreatorForRequest(req);
      if (!creator || via !== 'session') {
        return res.status(401).json({ ok: false, error: 'Creator login required' });
      }
      if (creator.verified) return res.json({ ok: true, alreadyVerified: true });

      const open = await latestFor(creator.id);
      if (open?.status === 'pending') {
        return res.json({ ok: true, status: 'pending', id: open.id, submittedAt: open.submitted_at });
      }

      const row = {
        id: crypto.randomUUID(),
        creator_id: creator.id,
        mode: MODE,
        provider: MODE === 'provider' ? PROVIDER : null,
        // The reference is generated here and handed to the provider; it is not
        // secret, and it is the only thing that ever links back to this row.
        provider_ref: MODE === 'provider' ? crypto.randomBytes(12).toString('hex') : null,
        status: 'pending',
        reviewer: null,
        reason: sanitize ? sanitize(String(req.body?.note || ''), 300) : String(req.body?.note || '').slice(0, 300),
        submitted_at: new Date().toISOString(),
        decided_at: null,
      };
      await saveRequest(row);
      audit?.('kyc_started', { creatorId: creator.id, mode: MODE });

      res.json({
        ok: true,
        status: 'pending',
        id: row.id,
        mode: MODE,
        providerRef: row.provider_ref,
        // In provider mode the client is sent to the provider's hosted flow, so
        // documents never touch this server.
        redirectUrl: MODE === 'provider' && process.env.KYC_START_URL
          ? `${process.env.KYC_START_URL}?ref=${row.provider_ref}`
          : null,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Could not start verification' });
    }
  });

  // -------------------------------------------------------------------------
  // Provider webhook — signature is mandatory, no exceptions.
  // -------------------------------------------------------------------------
  app.post('/api/creators/kyc/webhook', async (req, res) => {
    try {
      if (MODE !== 'provider') return res.status(404).json({ ok: false });
      if (!WEBHOOK_SECRET) {
        console.error('[kyc] webhook received but KYC_WEBHOOK_SECRET is unset — rejecting');
        return res.status(503).json({ ok: false });
      }
      const signature = String(req.headers['x-kyc-signature'] || '');
      const payload = JSON.stringify(req.body || {});
      const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        audit?.('kyc_webhook_bad_signature', { ip: req.ip });
        return res.status(401).json({ ok: false });
      }

      const ref = String(req.body?.ref || '');
      const verdict = String(req.body?.status || '').toLowerCase();
      if (!ref || !['approved', 'rejected'].includes(verdict)) {
        return res.status(400).json({ ok: false, error: 'Bad payload' });
      }

      let row = null;
      if (supabase) {
        const { data } = await supabase.from('mm_creator_kyc').select('*')
          .eq('provider_ref', ref).maybeSingle();
        row = data;
      }
      if (!row) row = ensureShape().find((r) => r.provider_ref === ref) || null;
      if (!row) return res.status(404).json({ ok: false });

      row.status = verdict;
      row.decided_at = new Date().toISOString();
      row.reviewer = `provider:${PROVIDER || 'unknown'}`;
      row.reason = String(req.body?.reason || '').slice(0, 300) || null;
      await saveRequest(row);

      const creator = await findCreatorById(row.creator_id);
      if (creator) await setVerified(creator, verdict === 'approved', row.reason, row.reviewer);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Webhook failed' });
    }
  });

  // -------------------------------------------------------------------------
  // Admin — the only path when MODE is off, and the review queue when manual.
  // -------------------------------------------------------------------------
  app.get('/api/admin/kyc/pending', async (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ ok: false, error: 'Forbidden' });
    let rows = [];
    if (supabase) {
      const { data } = await supabase.from('mm_creator_kyc').select('*')
        .eq('status', 'pending').order('submitted_at', { ascending: true }).limit(200);
      rows = data || [];
    } else {
      rows = ensureShape().filter((r) => r.status === 'pending');
    }
    const withHandles = await Promise.all(rows.map(async (r) => {
      const c = await findCreatorById(r.creator_id);
      return { ...r, handle: c?.handle_name || null, code: c?.creator_code || null };
    }));
    res.json({ ok: true, mode: MODE, requests: withHandles });
  });

  app.post('/api/admin/creators/:id/verify', async (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ ok: false, error: 'Forbidden' });
    try {
      const creator = await findCreatorById(req.params.id);
      if (!creator) return res.status(404).json({ ok: false, error: 'Creator not found' });
      const verified = req.body?.verified !== false;
      const reason = sanitize
        ? sanitize(String(req.body?.reason || ''), 300)
        : String(req.body?.reason || '').slice(0, 300);

      const open = await latestFor(creator.id);
      if (open && open.status === 'pending') {
        open.status = verified ? 'approved' : 'rejected';
        open.decided_at = new Date().toISOString();
        open.reviewer = 'admin';
        open.reason = reason || null;
        await saveRequest(open);
      }
      const patch = await setVerified(creator, verified, reason, 'admin');
      res.json({ ok: true, verified: patch.verified });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Verify failed' });
    }
  });

  return { mode: MODE, setVerified, latestFor };
}

module.exports = { registerCreatorKyc };
