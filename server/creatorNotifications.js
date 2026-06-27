/**
 * In-app creator notifications (admin actions, approvals, payouts).
 */
const crypto = require('crypto');

function makeLocalId() {
  return `cn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

async function pushCreatorNotification(ctx, payload) {
  const {
    creatorId,
    referralCode,
    type,
    title,
    message,
    important = true,
    metadata = {},
  } = payload;

  if (!creatorId || !type || !title) return null;

  const { supabase, localDb, saveLocalDb, io } = ctx;
  const row = {
    id: makeLocalId(),
    creator_id: creatorId,
    type,
    title: String(title).slice(0, 120),
    message: String(message || '').slice(0, 500),
    important: !!important,
    read: false,
    metadata: metadata || {},
    created_at: new Date().toISOString(),
  };

  if (supabase) {
    const { data, error } = await supabase
      .from('creator_notifications')
      .insert({
        creator_id: creatorId,
        type,
        title: row.title,
        message: row.message,
        important: row.important,
        read: false,
        metadata: row.metadata,
      })
      .select()
      .single();
    if (error) {
      console.error('[NOTIFY] insert failed', error.message);
    } else if (data) {
      row.id = data.id;
      row.created_at = data.created_at;
      row.read = data.read;
    }
  } else {
    if (!localDb.creator_notifications) localDb.creator_notifications = [];
    localDb.creator_notifications.push(row);
    if (localDb.creator_notifications.length > 500) {
      localDb.creator_notifications = localDb.creator_notifications.slice(-500);
    }
    saveLocalDb();
  }

  const notification = {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    important: row.important,
    read: row.read,
    metadata: row.metadata,
    created_at: row.created_at,
  };

  if (io && referralCode) {
    io.emit('creator-notification', {
      referral_code: referralCode,
      notification,
    });
  }

  return notification;
}

async function listCreatorNotifications(ctx, creatorId, { limit = 50 } = {}) {
  const { supabase, localDb } = ctx;
  if (supabase) {
    const { data } = await supabase
      .from('creator_notifications')
      .select('*')
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  }
  return (localDb.creator_notifications || [])
    .filter((n) => n.creator_id === creatorId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

async function countUnreadNotifications(ctx, creatorId) {
  const { supabase, localDb } = ctx;
  if (supabase) {
    const { count } = await supabase
      .from('creator_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('creator_id', creatorId)
      .eq('read', false);
    return count || 0;
  }
  return (localDb.creator_notifications || []).filter(
    (n) => n.creator_id === creatorId && !n.read
  ).length;
}

async function markNotificationsRead(ctx, creatorId, { ids = [], all = false } = {}) {
  const { supabase, localDb, saveLocalDb } = ctx;
  if (supabase) {
    if (all) {
      await supabase.from('creator_notifications').update({ read: true }).eq('creator_id', creatorId);
    } else if (ids.length) {
      await supabase.from('creator_notifications').update({ read: true }).eq('creator_id', creatorId).in('id', ids);
    }
    return;
  }
  (localDb.creator_notifications || []).forEach((n) => {
    if (n.creator_id !== creatorId) return;
    if (all || ids.includes(n.id)) n.read = true;
  });
  saveLocalDb();
}

module.exports = {
  pushCreatorNotification,
  listCreatorNotifications,
  countUnreadNotifications,
  markNotificationsRead,
};
