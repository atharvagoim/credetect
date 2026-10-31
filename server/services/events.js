import { AuditLog, SystemEvent } from '../models/index.js';
import { hmac } from '../utils/crypto.js';

export async function recordEvent({ level = 'info', kind, source, message, meta = {} }) {
  try {
    await SystemEvent.create({ level, kind, source, message: String(message || '').slice(0, 500), meta });
  } catch {
    /* never let telemetry break a request */
  }
}

/** Audit entries. Callers must pass only non-sensitive meta (ids, statuses, masked values). */
export async function audit(userId, action, { actor = 'user', targetType, targetId, meta = {} } = {}) {
  await AuditLog.create({
    user: userId || null,
    userRef: userId ? hmac('user:' + userId).slice(0, 16) : null,
    actor,
    action,
    targetType,
    targetId: targetId ? String(targetId) : undefined,
    meta,
  });
}
