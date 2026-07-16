import { get } from '../database.js';
import { normalizeSessionType } from './sessionPackages.js';

const capacityLocks = new Map();

export function normalizeTicketLimit(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0 ? limit : NaN;
}

export function isLimitedLiveEvent(session) {
  return normalizeSessionType(session?.session_type, session?.is_special_event) === 'event'
    && Number.isInteger(Number(session?.ticket_limit))
    && Number(session.ticket_limit) > 0;
}

export async function getLiveEventCapacity(session) {
  if (!isLimitedLiveEvent(session)) return null;

  const row = await get(
    `SELECT
       COUNT(CASE WHEN status = 'sold' THEN 1 END) AS sold,
       COUNT(CASE WHEN status = 'held' AND held_until > ? THEN 1 END) AS held
     FROM seats
     WHERE session_id = ?`,
    [new Date().toISOString(), session.id]
  );
  const limit = Number(session.ticket_limit);
  const sold = Number(row?.sold || 0);
  const held = Number(row?.held || 0);
  return {
    limit,
    sold,
    held,
    reserved: sold + held,
    remaining: Math.max(0, limit - sold - held),
  };
}

export async function withSessionCapacityLock(sessionId, fn) {
  const key = String(sessionId || '');
  const previous = capacityLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  capacityLocks.set(key, current);

  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (capacityLocks.get(key) === current) capacityLocks.delete(key);
  }
}
