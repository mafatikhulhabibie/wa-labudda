/**
 * Simple FIFO queue executed strictly one job at a time.
 * Swap this class for a BullMQ-backed implementation later (same enqueue API).
 */
export class InMemoryJobQueue {
  constructor() {
    /** @type {Promise<unknown>} */
    this._tail = Promise.resolve();
  }

  /**
   * @template T
   * @param {() => Promise<T>} job
   * @returns {Promise<T>}
   */
  enqueue(job) {
    const run = this._tail.then(() => job());
    this._tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
