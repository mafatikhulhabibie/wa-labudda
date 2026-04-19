import { getConfig } from '../config/index.js';
import { getSendCountsBySession } from '../repositories/sendActivityRepository.js';

/**
 * @param {string[]} sessionIds
 * @param {number} plannedAdds
 */
export async function evaluateBroadcastGuard(sessionIds, plannedAdds = 1) {
  const cfg = getConfig();
  const counts = await getSendCountsBySession(sessionIds);
  const checks = sessionIds.map((sid) => {
    const c = counts[sid] || { minute: 0, hour: 0, day: 0 };
    const projected = {
      minute: c.minute + plannedAdds,
      hour: c.hour + plannedAdds,
      day: c.day + plannedAdds,
    };
    const limits = {
      minute: cfg.broadcastMaxPerMinutePerDevice,
      hour: cfg.broadcastMaxPerHourPerDevice,
      day: cfg.broadcastMaxPerDayPerDevice,
    };
    const blocked =
      projected.minute > limits.minute || projected.hour > limits.hour || projected.day > limits.day;
    return { session_id: sid, current: c, projected, limits, blocked };
  });
  return { checks, blocked: checks.some((x) => x.blocked) };
}
