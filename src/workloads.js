// Preset workloads: the assignment's A and B (§4) and our own tests T1–T7 (PLAN.md §9).
// For T1–T7, `algorithm`/`quantum` name the case the test is about.

export const WORKLOADS = {
  A: {
    title: 'Workload A (assignment)', algorithm: null, quantum: 2,
    checks: 'Required workload A.',
    processes: [{ id: 'P1', arrival: 0, burst: 8 }, { id: 'P2', arrival: 1, burst: 4 }, { id: 'P3', arrival: 2, burst: 2 }, { id: 'P4', arrival: 4, burst: 1 }],
  },
  B: {
    title: 'Workload B (assignment)', algorithm: null, quantum: 2,
    checks: 'Required workload B.',
    processes: [{ id: 'P1', arrival: 2, burst: 3 }, { id: 'P2', arrival: 2, burst: 1 }, { id: 'P3', arrival: 8, burst: 2 }, { id: 'P4', arrival: 9, burst: 1 }],
  },
  T1: {
    title: 'T1: idle time', algorithm: 'FCFS', quantum: 2,
    checks: 'CPU idle at the start and in the middle.',
    processes: [{ id: 'P1', arrival: 3, burst: 2 }, { id: 'P2', arrival: 10, burst: 1 }],
  },
  T2: {
    title: 'T2: simultaneous arrivals + tie', algorithm: 'SJF', quantum: 2,
    checks: 'Simultaneous arrivals; equal bursts are broken by input order.',
    processes: [{ id: 'P1', arrival: 0, burst: 3 }, { id: 'P2', arrival: 0, burst: 3 }, { id: 'P3', arrival: 0, burst: 1 }],
  },
  T3: {
    title: 'T3: SRTF preemption', algorithm: 'SRTF', quantum: 2,
    checks: 'A strictly shorter arrival preempts the running process.',
    processes: [{ id: 'P1', arrival: 0, burst: 6 }, { id: 'P2', arrival: 2, burst: 2 }],
  },
  T4: {
    title: 'T4: RR quantum-boundary arrival', algorithm: 'RR', quantum: 2,
    checks: 'An arrival exactly at a quantum boundary is enqueued before the preempted process.',
    processes: [{ id: 'P1', arrival: 0, burst: 3 }, { id: 'P2', arrival: 2, burst: 2 }],
  },
  T5: {
    title: 'T5: SRTF equal remaining', algorithm: 'SRTF', quantum: 2,
    checks: 'Equal remaining time does not preempt.',
    processes: [{ id: 'P1', arrival: 0, burst: 3 }, { id: 'P2', arrival: 2, burst: 1 }],
  },
  T6: {
    title: 'T6: RR finishes mid-quantum', algorithm: 'RR', quantum: 2,
    checks: 'A process finishing mid-quantum releases the CPU and never re-enters the queue.',
    processes: [{ id: 'P1', arrival: 0, burst: 1 }, { id: 'P2', arrival: 0, burst: 2 }],
  },
  T7: {
    title: 'T7: RR consecutive slices', algorithm: 'RR', quantum: 2,
    checks: 'Consecutive slices of the same process stay separate and visible.',
    processes: [{ id: 'P1', arrival: 0, burst: 5 }],
  },
};
