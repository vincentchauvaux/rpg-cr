/**
 * File LLM globale par salon — un seul appel modèle à la fois par roomId.
 * Priorités : narrative > interactive > background (FIFO au sein d'une priorité).
 */

export type RoomLlmPriority = "narrative" | "interactive" | "background";

const PRIORITY_ORDER: RoomLlmPriority[] = ["narrative", "interactive", "background"];

type QueuedJob<T> = {
  id: string;
  priority: RoomLlmPriority;
  label: string;
  enqueuedAt: number;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

type RoomQueueState = {
  jobs: QueuedJob<unknown>[];
  processing: boolean;
  currentLabel: string | null;
};

const queues = new Map<string, RoomQueueState>();

function getQueue(roomId: string): RoomQueueState {
  let q = queues.get(roomId);
  if (!q) {
    q = { jobs: [], processing: false, currentLabel: null };
    queues.set(roomId, q);
  }
  return q;
}

function pickNextJob(q: RoomQueueState): QueuedJob<unknown> | undefined {
  for (const priority of PRIORITY_ORDER) {
    const idx = q.jobs.findIndex((j) => j.priority === priority);
    if (idx >= 0) return q.jobs.splice(idx, 1)[0];
  }
  return undefined;
}

async function drainRoomQueue(roomId: string): Promise<void> {
  const q = getQueue(roomId);
  if (q.processing) return;

  const job = pickNextJob(q);
  if (!job) return;

  q.processing = true;
  q.currentLabel = job.label;

  try {
    const result = await job.run();
    job.resolve(result);
  } catch (err) {
    job.reject(err);
  } finally {
    q.currentLabel = null;
    q.processing = false;
    if (!q.jobs.length) {
      queues.delete(roomId);
    } else {
      void drainRoomQueue(roomId);
    }
  }
}

export type EnqueueRoomLlmOptions = {
  priority?: RoomLlmPriority;
  /** Libellé debug (ex. `player:reclaim`, `character-all`). */
  label?: string;
};

/** Planifie un appel LLM dans la file du salon et renvoie sa promesse. */
export function enqueueRoomLlm<T>(
  roomId: string,
  run: () => Promise<T>,
  options: EnqueueRoomLlmOptions = {}
): Promise<T> {
  const priority = options.priority ?? "interactive";
  const label = options.label ?? priority;

  return new Promise<T>((resolve, reject) => {
    const q = getQueue(roomId);
    const job: QueuedJob<T> = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      priority,
      label,
      enqueuedAt: Date.now(),
      run,
      resolve,
      reject,
    };
    q.jobs.push(job as QueuedJob<unknown>);
    void drainRoomQueue(roomId);
  });
}

export function queueNarrativeLlm<T>(
  roomId: string,
  label: string,
  run: () => Promise<T>
): Promise<T> {
  return enqueueRoomLlm(roomId, run, { priority: "narrative", label });
}

export function queueInteractiveLlm<T>(
  roomId: string,
  label: string,
  run: () => Promise<T>
): Promise<T> {
  return enqueueRoomLlm(roomId, run, { priority: "interactive", label });
}

export function queueBackgroundLlm<T>(
  roomId: string,
  label: string,
  run: () => Promise<T>
): Promise<T> {
  return enqueueRoomLlm(roomId, run, { priority: "background", label });
}

/** État debug / observabilité (tests, logs). */
export function getRoomLlmQueueSnapshot(roomId: string): {
  processing: boolean;
  currentLabel: string | null;
  pending: { priority: RoomLlmPriority; label: string; waitMs: number }[];
} {
  const q = queues.get(roomId);
  if (!q) {
    return { processing: false, currentLabel: null, pending: [] };
  }
  const now = Date.now();
  return {
    processing: q.processing,
    currentLabel: q.currentLabel,
    pending: q.jobs.map((j) => ({
      priority: j.priority,
      label: j.label,
      waitMs: now - j.enqueuedAt,
    })),
  };
}
