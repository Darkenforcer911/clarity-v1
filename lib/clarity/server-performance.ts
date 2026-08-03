import "server-only";

const performanceLoggingEnabled =
  process.env.CLARITY_PERF_LOGGING !== "0";

export function startServerTimer(scope: string) {
  const startedAt = performance.now();

  return {
    async measure<T>(step: string, work: () => PromiseLike<T>) {
      const stepStartedAt = performance.now();

      try {
        return await work();
      } finally {
        logTiming(scope, step, performance.now() - stepStartedAt);
      }
    },
    finish() {
      logTiming(scope, "total", performance.now() - startedAt);
    },
  };
}

function logTiming(scope: string, step: string, durationMs: number) {
  if (!performanceLoggingEnabled) {
    return;
  }

  console.info(
    "[clarity-perf]",
    JSON.stringify({
      scope,
      step,
      durationMs: Math.round(durationMs),
    }),
  );
}
