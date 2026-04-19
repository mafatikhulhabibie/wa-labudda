/**
 * Future Redis / BullMQ integration:
 *
 * Implement a driver with:
 *   - enqueue(sessionId, jobDescriptor) -> Promise<result>
 *   - ensureWorker(sessionId) to consume per-session lists
 *
 * The current `InMemoryJobQueue` per session matches this shape locally.
 * When moving to BullMQ, use one named queue per session or a shared queue
 * with job.data.sessionId and concurrency keyed by session.
 */

export const QUEUE_DRIVER_MEMORY = 'memory';
export const QUEUE_DRIVER_REDIS = 'redis'; // not implemented — placeholder for ops
