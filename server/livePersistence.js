/**
 * Live analytics writer.
 *
 * Everything here is fire-and-forget and BUFFERED: a busy room must never turn
 * one comment or one like into one database round-trip. Rows accumulate in
 * memory and flush on a timer or when a batch fills, and a failed flush is
 * dropped rather than retried forever — this is reporting data, not money.
 * (Money is `mm_live_gift_tx`, written synchronously in liveStreams.js.)
 *
 * With no Supabase configured every method is a cheap no-op, so single-instance
 * and local development behave exactly as before.
 */

const FLUSH_MS = 5000;
const REACTION_FLUSH_MS = 15_000;
const MAX_BATCH = 200;
const MAX_BUFFER = 2000;     // hard ceiling; oldest rows are dropped past this

function createLivePersistence({ supabase, enabled = true } = {}) {
  const on = !!supabase && enabled;

  const buffers = {
    comments: [],
    viewers: [],
    reactions: new Map(),    // liveId -> count in the current bucket
  };
  const commentCounts = new Map();   // liveId -> comments seen (for analytics)
  const deletions = [];

  function push(list, row) {
    list.push(row);
    if (list.length > MAX_BUFFER) list.splice(0, list.length - MAX_BUFFER);
  }

  async function insert(table, rows) {
    if (!on || !rows.length) return;
    try {
      await supabase.from(table).insert(rows);
    } catch (e) {
      console.error(`[livePersistence] ${table} insert failed:`, e.message);
    }
  }

  async function flushComments() {
    if (!buffers.comments.length && !deletions.length) return;
    const batch = buffers.comments.splice(0, MAX_BATCH);
    await insert('mm_live_comments', batch);

    const dels = deletions.splice(0, MAX_BATCH);
    for (const d of dels) {
      try {
        await supabase.from('mm_live_comments')
          .update({ deleted_by: d.by })
          .eq('id', d.id);
      } catch { /* the row may not have flushed yet; not worth retrying */ }
    }
  }

  async function flushViewers() {
    if (!buffers.viewers.length) return;
    await insert('mm_live_viewers', buffers.viewers.splice(0, MAX_BATCH));
  }

  async function flushReactions() {
    if (!buffers.reactions.size) return;
    const rows = [...buffers.reactions.entries()].map(([live_id, count]) => ({
      live_id, count, bucket_at: new Date().toISOString(),
    }));
    buffers.reactions.clear();
    await insert('mm_live_reactions', rows);
  }

  let timers = [];
  if (on) {
    const t1 = setInterval(() => { void flushComments(); void flushViewers(); }, FLUSH_MS);
    const t2 = setInterval(() => { void flushReactions(); }, REACTION_FLUSH_MS);
    timers = [t1, t2];
    timers.forEach((t) => t.unref?.());
  }

  return {
    enabled: on,

    /** A live started — the row analytics later updates. */
    openStream(room) {
      if (!on) return;
      commentCounts.set(room.id, 0);
      supabase.from('mm_live_streams').upsert({
        id: room.id,
        creator_id: room.creatorId,
        handle: room.handle,
        title: room.title,
        status: 'live',
        started_at: new Date(room.startedAt).toISOString(),
      }).then(() => {}, (e) => console.error('[livePersistence] openStream:', e.message));
    },

    recordComment(liveId, msg, senderKey) {
      if (!on) return;
      commentCounts.set(liveId, (commentCounts.get(liveId) || 0) + 1);
      push(buffers.comments, {
        id: msg.id,
        live_id: liveId,
        sender_key: senderKey || null,
        username: msg.username,
        text: msg.text,
        filtered: !!msg.filtered,
        created_at: new Date(msg.at).toISOString(),
      });
      if (buffers.comments.length >= MAX_BATCH) void flushComments();
    },

    markCommentDeleted(commentId, byKey) {
      if (!on) return;
      deletions.push({ id: commentId, by: String(byKey || 'moderator').slice(0, 64) });
    },

    /** Aggregate bucket, never one row per tap. */
    recordReactions(liveId, count) {
      if (!on || !count) return;
      buffers.reactions.set(liveId, (buffers.reactions.get(liveId) || 0) + count);
    },

    /** Written when a viewer leaves, so watch time is real, not sampled. */
    recordWatch(liveId, viewer) {
      if (!on || !viewer) return;
      const joined = Number(viewer.joinedAt) || Date.now();
      push(buffers.viewers, {
        live_id: liveId,
        viewer_key: viewer.key || null,
        username: viewer.username || null,
        joined_at: new Date(joined).toISOString(),
        left_at: new Date().toISOString(),
        watch_ms: Math.max(0, Date.now() - joined),
        country: viewer.country || null,
      });
      if (buffers.viewers.length >= MAX_BATCH) void flushViewers();
    },

    recordModerator(creatorId, modKey, granted) {
      if (!on || !creatorId || !modKey) return;
      if (granted) {
        supabase.from('mm_live_moderators')
          .upsert({ creator_id: creatorId, mod_key: modKey }, { onConflict: 'creator_id,mod_key' })
          .then(() => {}, () => {});
      } else {
        supabase.from('mm_live_moderators')
          .delete().eq('creator_id', creatorId).eq('mod_key', modKey)
          .then(() => {}, () => {});
      }
    },

    /**
     * A live ended. Flush everything still buffered, close the stream row, and
     * write the two derived rows: the payout receipt and the analytics record.
     */
    async closeStream(room, summary, extra = {}) {
      if (!on) return;
      // Any viewers still in the room never fired a leave — bill their watch
      // time now so the numbers add up.
      for (const v of extra.viewers || []) this.recordWatch(room.id, v);
      await Promise.all([flushComments(), flushViewers(), flushReactions()]);

      const comments = commentCounts.get(room.id) || 0;
      commentCounts.delete(room.id);

      const endedAt = new Date().toISOString();
      const tasks = [
        supabase.from('mm_live_streams').update({
          status: 'ended',
          ended_at: endedAt,
          nuts_earned: summary.nutsEarned,
          peak_viewers: summary.peakViewers,
          total_viewers: summary.totalViewers,
          likes: summary.likes,
          gift_count: summary.giftCount,
        }).eq('id', room.id),

        supabase.from('mm_live_gift_receipts').insert({
          live_id: room.id,
          creator_id: room.creatorId,
          gross_coins: summary.coinsReceived,
          net_coins: summary.nutsEarned,
          gift_count: summary.giftCount,
          settled_at: endedAt,
        }),

        supabase.from('mm_live_analytics').upsert({
          live_id: room.id,
          creator_id: room.creatorId,
          duration_ms: summary.durationMs,
          peak_viewers: summary.peakViewers,
          total_viewers: summary.totalViewers,
          likes: summary.likes,
          comments,
          gift_count: summary.giftCount,
          coins_gross: summary.coinsReceived,
          coins_net: summary.nutsEarned,
        }),
      ];

      const results = await Promise.allSettled(tasks);
      for (const r of results) {
        if (r.status === 'rejected') console.error('[livePersistence] closeStream:', r.reason?.message);
      }
    },

    async flushAll() {
      if (!on) return;
      await Promise.all([flushComments(), flushViewers(), flushReactions()]);
    },

    stop() {
      timers.forEach(clearInterval);
      timers = [];
    },
  };
}

module.exports = { createLivePersistence };
