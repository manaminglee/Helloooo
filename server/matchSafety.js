/**
 * Match safety — what happens to someone strangers keep reporting.
 *
 * Reports used to be a table nobody read. A person exposing themselves could be
 * reported by fifty people in an hour and keep getting matched with new
 * strangers all night, because nothing between "report stored" and "an admin
 * manually bans an IP" ever acted. This is that missing middle.
 *
 * The design constraints that shaped it:
 *
 *   · **Distinct reporters, not report count.** One angry person hammering the
 *     report button must not remove somebody, and the queue makes it trivial to
 *     be matched with the same person twice. Only unique reporters count.
 *   · **Escalate, don't ban.** A first strike is a cooling-off period, not an
 *     execution. Bad-faith reporting exists, IPs are shared, and a wrongly
 *     suspended user gets no explanation and no appeal. Repeat strikes get
 *     longer, and only a sustained pattern reaches a length a human should
 *     review.
 *   · **Reports expire.** A report from three weeks ago says very little about
 *     who is on camera now, especially on an address a carrier reassigns daily.
 *   · **Never hard-fail matching.** If this module throws or its store is down,
 *     matching continues. A safety layer that can take the whole product down
 *     is a worse bug than the one it prevents.
 *
 * Suspension is deliberately from MATCHING, not from the site: an existing
 * conversation is left alone, and the person can still read, top up, and reach
 * support. They simply stop being handed new strangers.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How far back a report still counts against someone. */
const REPORT_WINDOW_MS = Number(process.env.REPORT_WINDOW_MS || 7 * DAY);

/** Distinct reporters needed inside the window before the first suspension. */
const STRIKE_THRESHOLD = Number(process.env.REPORT_STRIKE_THRESHOLD || 3);

/**
 * Suspension length by strike number. The last entry repeats, so a persistent
 * offender sits at 7 days rather than growing to something unreviewable.
 */
const LADDER_MS = [30 * MINUTE, 6 * HOUR, 24 * HOUR, 7 * DAY];

/** Above this many distinct reporters, flag for a human rather than just timing out. */
const REVIEW_THRESHOLD = Number(process.env.REPORT_REVIEW_THRESHOLD || 8);

function ladderFor(strike) {
  return LADDER_MS[Math.min(Math.max(1, strike), LADDER_MS.length) - 1];
}

/**
 * @param {object} deps
 * @param {(event: object) => void} [deps.onSuspend] notified when a suspension starts
 * @param {() => number} [deps.now] injectable clock, for tests
 */
function createMatchSafety({ onSuspend, now = () => Date.now() } = {}) {
  /**
   * key -> {
   *   reporters: Map<reporterKey, ts>,   // distinct reporters and when
   *   strikes: number,
   *   lastStrikeAt: number,             // when the most recent strike landed
   *   until: number,                     // suspended-from-matching until
   *   flagged: boolean,                  // needs human review
   *   lastReason: string,
   * }
   */
  const records = new Map();

  function blank() {
    return { reporters: new Map(), strikes: 0, until: 0, flagged: false, lastReason: '', lastStrikeAt: 0 };
  }

  /** Drop reports that have aged out; returns the live reporter count. */
  function prune(rec, t) {
    for (const [who, ts] of rec.reporters) {
      if (t - ts > REPORT_WINDOW_MS) rec.reporters.delete(who);
    }
    return rec.reporters.size;
  }

  /**
   * Record a report against `targetKey`.
   *
   * `reporterKey` is what makes a reporter distinct — pass the most stable
   * identifier available (device handle, else IP). Self-reports are dropped:
   * without that check anyone can suspend themselves, and more importantly a
   * bug that mixes up the two keys would suspend the reporter.
   *
   * @returns {{counted: boolean, reporters: number, suspendedUntil: number, flagged: boolean}}
   */
  function report(targetKey, reporterKey, reason = '') {
    const target = String(targetKey || '');
    const reporter = String(reporterKey || '');
    if (!target || !reporter || target === reporter || target === 'unknown') {
      return { counted: false, reporters: 0, suspendedUntil: 0, flagged: false };
    }

    const t = now();
    const rec = records.get(target) || blank();
    records.set(target, rec);

    // Strikes decay on read, not on a sweep. Tying decay to the sweep meant a
    // record kept for moderator review never decayed at all, so one flagged
    // incident escalated somebody's ladder forever. Doing it here also makes
    // decay independent of whether the sweep timer ever fires.
    if (rec.strikes && t - rec.lastStrikeAt > REPORT_WINDOW_MS) {
      rec.strikes = 0;
    }

    const isNewReporter = !rec.reporters.has(reporter);
    rec.reporters.set(reporter, t);
    if (reason) rec.lastReason = String(reason).slice(0, 120);
    const distinct = prune(rec, t);

    // A repeat report from someone who already reported this person refreshes
    // their timestamp but must not push the count up.
    if (isNewReporter && distinct >= STRIKE_THRESHOLD && t >= rec.until) {
      rec.strikes += 1;
      rec.lastStrikeAt = t;
      rec.until = t + ladderFor(rec.strikes);
      // Each strike starts a fresh window. Without this the same three reports
      // would keep re-triggering, and the ladder would run away on one incident.
      rec.reporters.clear();
      if (rec.strikes >= 2 || distinct >= REVIEW_THRESHOLD) rec.flagged = true;
      try {
        onSuspend?.({
          key: target,
          strikes: rec.strikes,
          until: rec.until,
          reporters: distinct,
          reason: rec.lastReason,
          flagged: rec.flagged,
        });
      } catch { /* a listener must never break the report path */ }
    } else if (distinct >= REVIEW_THRESHOLD) {
      rec.flagged = true;
    }

    return {
      counted: isNewReporter,
      reporters: rec.reporters.size,
      suspendedUntil: rec.until,
      flagged: rec.flagged,
    };
  }

  /** Is this key currently suspended from being handed new strangers? */
  function isSuspended(key) {
    const rec = records.get(String(key || ''));
    return !!rec && now() < rec.until;
  }

  /** Suspension detail for the person themselves — what to show, and for how long. */
  function statusOf(key) {
    const rec = records.get(String(key || ''));
    if (!rec) return { suspended: false, until: 0, strikes: 0, secondsLeft: 0 };
    const t = now();
    const suspended = t < rec.until;
    return {
      suspended,
      until: suspended ? rec.until : 0,
      strikes: rec.strikes,
      secondsLeft: suspended ? Math.ceil((rec.until - t) / 1000) : 0,
    };
  }

  /**
   * Everyone an admin should look at: currently suspended, or past the review
   * threshold. Sorted by strikes so the worst are first.
   */
  function reviewQueue(limit = 50) {
    const t = now();
    const out = [];
    for (const [key, rec] of records) {
      const suspended = t < rec.until;
      if (!suspended && !rec.flagged) continue;
      out.push({
        key,
        strikes: rec.strikes,
        reporters: rec.reporters.size,
        suspended,
        until: rec.until,
        flagged: rec.flagged,
        lastReason: rec.lastReason,
      });
    }
    out.sort((a, b) => b.strikes - a.strikes || b.reporters - a.reporters);
    return out.slice(0, limit);
  }

  /** Admin override — clears the suspension and the strike history. */
  function clear(key) {
    return records.delete(String(key || ''));
  }

  /**
   * Drop records nobody needs any more, so a long-running process stays bounded.
   *
   * A record is kept while its strike history still matters. Taking a strike
   * clears the reporter list (so one incident cannot re-trigger), which would
   * otherwise make the record instantly sweepable the moment its pause expired
   * — and then a person who offends once a month would sit on strike 1 forever
   * and never escalate. Strikes therefore survive for one report window past
   * the last one, and then decay: a pause from a month ago should not make
   * tonight's first complaint a second offence.
   */
  function sweep() {
    const t = now();
    let removed = 0;
    for (const [key, rec] of records) {
      const noLiveReports = prune(rec, t) === 0;
      const pauseOver = t >= rec.until;
      // Mirrors the decay rule in report(): a record whose strikes have aged
      // out and that nobody is reporting is not worth keeping.
      const strikesDecayed = !rec.strikes || t - rec.lastStrikeAt > REPORT_WINDOW_MS;
      if (noLiveReports && pauseOver && strikesDecayed && !rec.flagged) {
        records.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  return {
    report,
    isSuspended,
    statusOf,
    reviewQueue,
    clear,
    sweep,
    size: () => records.size,
    STRIKE_THRESHOLD,
    REPORT_WINDOW_MS,
    LADDER_MS,
  };
}

module.exports = { createMatchSafety, LADDER_MS, STRIKE_THRESHOLD, REPORT_WINDOW_MS };
