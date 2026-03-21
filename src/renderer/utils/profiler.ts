// ── Import Pipeline Profiler ─────────────────────────────────────────
// Collects timing data for each step of the ICP import pipeline.
// Results exposed via window.__BOBCORN_PERF__ for E2E test collection.

interface PerfEntry {
  name: string;
  start: number;
  end: number;
  duration: number;
}

interface PerfSession {
  sessionId: number;
  entries: PerfEntry[];
  totalStart: number;
  totalEnd: number;
  totalDuration: number;
}

class ImportProfiler {
  private entries: PerfEntry[] = [];
  private marks: Map<string, number> = new Map();
  private sessionCount = 0;
  private sessions: PerfSession[] = [];
  private totalStart = 0;

  /** Start timing a named phase */
  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  /** End timing a named phase and record the entry */
  measure(name: string): number {
    const start = this.marks.get(name);
    if (start === undefined) return 0;
    const end = performance.now();
    const duration = end - start;
    this.entries.push({ name, start, end, duration });
    this.marks.delete(name);
    return duration;
  }

  /** Start a new profiling session (call before import begins) */
  startSession(): void {
    this.entries = [];
    this.marks.clear();
    this.totalStart = performance.now();
  }

  /** End the session and store results */
  endSession(): PerfSession {
    const totalEnd = performance.now();
    const session: PerfSession = {
      sessionId: ++this.sessionCount,
      entries: [...this.entries],
      totalStart: this.totalStart,
      totalEnd,
      totalDuration: totalEnd - this.totalStart,
    };
    this.sessions.push(session);
    this.entries = [];
    this.marks.clear();
    return session;
  }

  /** Get all collected sessions */
  getSessions(): PerfSession[] {
    return this.sessions;
  }

  /** Get the latest session */
  getLatest(): PerfSession | null {
    return this.sessions.length > 0 ? this.sessions[this.sessions.length - 1] : null;
  }

  /** Clear all sessions */
  clear(): void {
    this.sessions = [];
    this.entries = [];
    this.marks.clear();
    this.sessionCount = 0;
  }
}

// Singleton instance
const importProfiler = new ImportProfiler();

// Expose on window for E2E test collection
(window as any).__BOBCORN_PERF__ = importProfiler;

export default importProfiler;
