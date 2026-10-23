/** Coalesce concurrent triggers so one stateful job runs at a time. */
export function createSingleFlight<T>(run: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return () => {
    if (inFlight) return inFlight;

    const job = run();
    inFlight = job;
    void job.finally(() => {
      if (inFlight === job) inFlight = null;
    }).catch(() => undefined);

    return job;
  };
}
