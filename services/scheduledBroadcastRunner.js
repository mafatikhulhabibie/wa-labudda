import { findDeviceBySessionId } from '../repositories/deviceRepository.js';
import { recordSendActivity } from '../repositories/sendActivityRepository.js';
import { evaluateBroadcastGuard } from './broadcastGuard.js';
import {
  claimDueScheduledBroadcasts,
  markScheduledBroadcastFailed,
  markScheduledBroadcastSent,
} from '../repositories/scheduledBroadcastRepository.js';
import { logger } from '../utils/logger.js';
import { whatsappManager } from './whatsappManager.js';

class ScheduledBroadcastRunner {
  constructor() {
    this.timer = null;
    this.inProgress = false;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 15_000);
    void this.tick();
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.inProgress) return;
    this.inProgress = true;
    try {
      const jobs = await claimDueScheduledBroadcasts(20);
      for (const job of jobs) {
        await this.processJob(job);
      }
    } catch (err) {
      logger.error({ err }, 'scheduled broadcast runner tick failed');
    } finally {
      this.inProgress = false;
    }
  }

  /**
   * @param {{ id: number, user_id: number, session_ids: string[], number: string, message: string }} job
   */
  async processJob(job) {
    try {
      const guard = await evaluateBroadcastGuard(job.session_ids, 1);
      if (guard.blocked) {
        await markScheduledBroadcastFailed(job.id, 'Ditolak guard anti-spam per device');
        return;
      }
      const out = await whatsappManager.broadcast(job.session_ids, job.number, job.message);
      for (const r of out.results || []) {
        if (!r.success || !r.session_id) continue;
        const dev = await findDeviceBySessionId(r.session_id);
        if (dev) await recordSendActivity(Number(dev.user_id), r.session_id).catch(() => {});
      }
      const failed = (out.results || []).filter((x) => !x.success);
      if (failed.length) {
        await markScheduledBroadcastFailed(
          job.id,
          `Sebagian gagal: ${failed.map((x) => `${x.session_id}:${x.error || 'error'}`).join(', ')}`,
        );
      } else {
        await markScheduledBroadcastSent(job.id);
      }
      logger.info({ jobId: job.id, total: out.results?.length || 0 }, 'scheduled broadcast processed');
    } catch (err) {
      await markScheduledBroadcastFailed(job.id, err?.message || 'Failed processing job').catch(() => {});
      logger.warn({ err, jobId: job.id }, 'scheduled broadcast failed');
    }
  }
}

export const scheduledBroadcastRunner = new ScheduledBroadcastRunner();
