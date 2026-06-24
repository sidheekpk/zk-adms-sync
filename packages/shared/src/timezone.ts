// Device time / timezone helpers.
//
// ZKTeco devices accept a Unix-seconds timestamp via `SET OPTIONS DateTime=...`.
// They have no native IANA timezone awareness — we compute the local wall
// clock time on the server side and push that as Unix seconds.
//
// Daylight savings: when DST shifts, we need to re-push. The DeviceMonitor
// job tracks `timezoneSyncedAt` per device and pushes a new sync at the
// next DST transition (or once a week as a safety net).

/**
 * For a given IANA timezone, return the unix-seconds value the device
 * should be told to "be at" right now so that the device's internal clock
 * (which treats whatever it stores as if it were UTC) displays the correct
 * wall-clock time for that timezone.
 *
 * Concretely: many ZK devices keep an internal Unix timestamp and render
 * it as UTC on screen. We shift the timestamp by the zone offset so the
 * rendered "UTC" wall clock equals the desired local wall clock.
 */
export function deviceClockTimestamp(tz: string, at: Date = new Date()): number {
  const offsetMs = getZoneOffsetMs(tz, at);
  return Math.floor((at.getTime() + offsetMs) / 1000);
}

/** Offset of the given IANA timezone from UTC, in milliseconds, at `at`. */
export function getZoneOffsetMs(tz: string, at: Date = new Date()): number {
  // Format the date in the target zone, then re-parse as UTC; the delta
  // is the zone's UTC offset at that instant (DST-aware).
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  const asUtcMs = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour === '24' ? '0' : map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtcMs - at.getTime();
}

/** Return next DST transition instant in `tz` after `from`, or null if none in the next year. */
export function nextDstTransition(tz: string, from: Date = new Date()): Date | null {
  const start = from.getTime();
  const end = start + 365 * 24 * 3600 * 1000;
  const startOffset = getZoneOffsetMs(tz, new Date(start));
  // Binary-ish search in 1h increments — cheap and good enough.
  let prev = startOffset;
  for (let t = start + 3600_000; t <= end; t += 3600_000) {
    const cur = getZoneOffsetMs(tz, new Date(t));
    if (cur !== prev) {
      // Narrow to the minute
      let lo = t - 3600_000;
      let hi = t;
      while (hi - lo > 60_000) {
        const mid = Math.floor((lo + hi) / 2);
        if (getZoneOffsetMs(tz, new Date(mid)) === prev) lo = mid;
        else hi = mid;
      }
      return new Date(hi);
    }
    prev = cur;
  }
  return null;
}

/** Validate an IANA timezone identifier. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
