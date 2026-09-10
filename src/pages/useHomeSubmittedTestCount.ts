import { useEffect, useState } from "react";
import { loadHomeSubmittedTestCount } from "../lib/homeSubmittedTestCount";

// Data freshness and request timeout, not visual motion durations.
const refreshIntervalMs = 60_000;
const requestTimeoutMs = 10_000;

export function useHomeSubmittedTestCount(enabled: boolean, fixtureCount?: number) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (fixtureCount !== undefined) {
      setCount(fixtureCount);
      return;
    }
    if (!enabled) {
      setCount(null);
      return;
    }

    const controller = new AbortController();
    let inFlight = false;
    const refresh = async () => {
      if (document.hidden || inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const nextCount = await loadHomeSubmittedTestCount(
          AbortSignal.any([controller.signal, AbortSignal.timeout(requestTimeoutMs)]),
        );
        if (!controller.signal.aborted) setCount(nextCount);
      } catch {
        // Keep the homepage usable without inventing a number during an outage.
        if (!controller.signal.aborted) setCount(null);
      } finally {
        inFlight = false;
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), refreshIntervalMs);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [enabled, fixtureCount]);

  return count;
}
