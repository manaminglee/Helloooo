/**
 * Shared creator approve / reject — used by Admin + Agency for one consistent path.
 */
const creatorSecurity = require('./creatorSecurity');

/**
 * @returns {{ ok: boolean, error?: string, creator?: object, password?: string|null, already?: boolean }}
 */
async function applyCreatorStatus(deps, { creatorId, status, reason = '' }) {
  const {
    supabase,
    localDb,
    saveLocalDb,
    sanitize,
    notifyCreatorAction,
    emitToCreator,
    emitToAdmins,
    creatorEmail,
    audit,
  } = deps;

  if (!creatorId || !['approved', 'rejected', 'pending'].includes(status)) {
    return { ok: false, error: 'Invalid creatorId or status' };
  }

  let creator = (localDb.creators || []).find((x) => x.id === creatorId) || null;
  if (supabase) {
    try {
      const { data } = await supabase.from('creators').select('*').eq('id', creatorId).maybeSingle();
      if (data) creator = data;
    } catch (e) {
      console.warn('[CREATOR_APPROVE] fetch failed:', e.message);
    }
  }
  if (!creator) return { ok: false, error: 'Creator not found' };

  const prevStatus = creator.status;
  if (prevStatus === status) {
    return {
      ok: true,
      already: true,
      creator: creatorSecurity.stripCreatorSecrets(creator),
      password: null,
    };
  }

  const updates = { status };
  let plainPassword = null;

  if (status === 'approved') {
    if (!creator.password_hash && !creator.password) {
      plainPassword = creatorSecurity.generateSecurePassword(creator.handle_name);
      updates.password_hash = await creatorSecurity.hashPassword(plainPassword);
      updates.password = null;
    } else if (creator.password && !creator.password_hash) {
      plainPassword = creator.password;
      updates.password_hash = await creatorSecurity.hashPassword(creator.password);
      updates.password = null;
    }
    // Bonus only on first transition into approved
    if (prevStatus !== 'approved') {
      updates.coins_earned = (creator.coins_earned || 0) + 500;
      updates.earnings_rs = creatorSecurity.computeEarningsRs(updates.coins_earned);
    }
    updates.rejection_reason = null;
    updates.approved_at = new Date().toISOString();
  } else if (status === 'rejected') {
    const cleanReason = typeof sanitize === 'function'
      ? sanitize(reason || 'Did not meet program requirements', 200)
      : String(reason || 'Did not meet program requirements').slice(0, 200);
    updates.rejection_reason = cleanReason;
  } else if (status === 'pending') {
    updates.rejection_reason = null;
  }

  // Persist — local first for instant resolve, then Supabase
  const local = (localDb.creators || []).find((x) => x.id === creatorId);
  if (local) Object.assign(local, updates);
  else if (localDb.creators) {
    localDb.creators.push({ ...creator, ...updates });
  }
  saveLocalDb?.();

  if (supabase) {
    try {
      // Drop columns that may not exist yet
      const payload = { ...updates };
      const { error } = await supabase.from('creators').update(payload).eq('id', creatorId);
      if (error && String(error.message || '').includes('approved_at')) {
        delete payload.approved_at;
        await supabase.from('creators').update(payload).eq('id', creatorId);
      } else if (error) {
        console.warn('[CREATOR_APPROVE] supabase update:', error.message);
      }

      await supabase.from('admin_history').insert({
        action_type: 'CREATOR_APPROVE',
        target_id: creatorId,
        target_name: creator.handle_name,
        details: `Status ${prevStatus} → ${status}${status === 'approved' && prevStatus !== 'approved' ? ' (+500 bonus)' : ''}`,
      }).catch(() => {});

      if (status === 'approved' && prevStatus !== 'approved') {
        await creatorSecurity.logCreatorEvent(supabase, localDb, saveLocalDb, {
          creatorId,
          eventType: 'approval_bonus',
          amount: 500,
          details: 'Creator approval bonus',
        });
      }
    } catch (e) {
      console.warn('[CREATOR_APPROVE] supabase side effects:', e.message);
    }
  } else {
    if (!localDb.admin_history) localDb.admin_history = [];
    localDb.admin_history.push({
      id: Date.now().toString(),
      action_type: 'CREATOR_APPROVE',
      target_id: creatorId,
      target_name: creator.handle_name,
      details: `Status ${prevStatus} → ${status}`,
      created_at: new Date().toISOString(),
    });
    saveLocalDb?.();
  }

  const merged = { ...creator, ...updates };
  audit?.('creator_status', { creatorId, status, prevStatus });

  const statusPayload = {
    referral_code: creator.referral_code,
    handle_name: creator.handle_name,
    status,
    rejection_reason: updates.rejection_reason || null,
  };
  try { emitToCreator?.(merged, 'creator-status-changed', statusPayload); } catch { /* */ }
  try { emitToAdmins?.('creator-status-changed', statusPayload); } catch { /* */ }
  try {
    // Agency / generic listeners
    const io = deps.io;
    io?.emit?.('creator-status-updated', { creatorId, status, handle: creator.handle_name });
  } catch { /* */ }

  if (status === 'approved' && notifyCreatorAction) {
    try {
      await notifyCreatorAction(merged, {
        type: 'approved',
        title: 'Application approved',
        message: plainPassword
          ? `You're in! Admin assigned a temporary password — check your email. +500 bonus coins added.`
          : `You're approved! Log in with the password you set during registration. +500 bonus coins added.`,
        important: true,
        metadata: { bonus_coins: 500 },
      });
    } catch { /* */ }
    creatorEmail?.notifyCreatorApproved?.(merged, plainPassword)?.catch?.((e) =>
      console.error('[EMAIL] approve notify', e.message)
    );
  } else if (status === 'rejected' && notifyCreatorAction) {
    try {
      await notifyCreatorAction(merged, {
        type: 'rejected',
        title: 'Application rejected',
        message: updates.rejection_reason || 'Your application was not approved at this time.',
        important: true,
      });
    } catch { /* */ }
    creatorEmail?.notifyCreatorRejected?.(merged, updates.rejection_reason)?.catch?.((e) =>
      console.error('[EMAIL] reject notify', e.message)
    );
  }

  return {
    ok: true,
    creator: creatorSecurity.stripCreatorSecrets(merged),
    password: plainPassword || undefined,
    already: false,
  };
}

async function applyCreatorStatusBulk(deps, { creatorIds, status, reason }) {
  const ids = [...new Set((creatorIds || []).map(String).filter(Boolean))];
  if (!ids.length) return { ok: false, error: 'No creatorIds' };
  const results = [];
  for (const id of ids) {
    // Sequential to avoid double-bonus races on shared localDb
    // eslint-disable-next-line no-await-in-loop
    const r = await applyCreatorStatus(deps, { creatorId: id, status, reason });
    results.push({ creatorId: id, ...r });
  }
  const okCount = results.filter((r) => r.ok).length;
  return { ok: true, results, okCount, total: ids.length };
}

module.exports = { applyCreatorStatus, applyCreatorStatusBulk };
