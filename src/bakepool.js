// Runs the big bakes (terrain heights and colours, grass data, the area map) on several CPU cores at once.
// Each worker builds its own copy of the world, then takes bands of rows off a shared queue until every job
// is done; the bands are stitched into one array per job. If workers aren't available, the same functions run
// here on the main thread instead.
import { BAKE, bakeRows } from './bakers.js';

const BAND = 48; // rows per piece of work

export function startBakes(kinds) {
  const jobs = new Map(), queue = [];
  for (const kind of kinds) {
    const { N } = BAKE[kind];
    const per = kind === 'color' || kind === 'map' ? 4 : 1; // elements per pixel in the result
    const Arr = kind === 'height' ? Float32Array : kind === 'grass' ? Uint16Array : Uint8ClampedArray;
    const out = new Arr(N * N * per * (kind === 'grass' ? 4 : 1));
    let left = Math.ceil(N / BAND), resolve;
    const done = new Promise((r) => (resolve = r));
    jobs.set(kind, { done, out, N, put(j0, buf) { out.set(new Arr(buf), j0 * N * per * (kind === 'grass' ? 4 : 1)); if (--left === 0) resolve(out); } });
    for (let j0 = 0; j0 < N; j0 += BAND) queue.push({ kind, j0, j1: Math.min(N, j0 + BAND) });
  }
  const result = Object.fromEntries([...jobs].map(([k, j]) => [k, j.done]));
  // how long each bake took, for the ?prof readout
  const t0 = performance.now();
  globalThis.__bakeTimes = {};
  for (const [k, p] of Object.entries(result)) p.then(() => { globalThis.__bakeTimes[k] = Math.round(performance.now() - t0); });

  const runHere = () => { // no workers: do it all here, a piece at a time so the page stays alive
    const step = () => {
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < 30) { const q = queue.shift(); jobs.get(q.kind).put(q.j0, bakeRows(q.kind, q.j0, q.j1)); }
      if (queue.length) setTimeout(step, 0);
    };
    step();
  };
  let workers = [];
  try {
    const n = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
    // deal the bands out round-robin, so every worker has some of each job and they all finish together
    const lists = Array.from({ length: n }, () => []);
    queue.forEach((q, i) => lists[i % n].push(q));
    queue.length = 0;
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./bake.worker.js', import.meta.url), { type: 'module' });
      const mine = lists[i], got = new Set();
      const fail = (why) => {
        // this worker can't do its share: bake whatever it hadn't sent back here instead
        console.warn('bake worker failed, finishing its share here:', why);
        w.terminate(); workers = workers.filter((o) => o !== w);
        for (const q of mine) if (!got.has(q.kind + q.j0)) queue.push(q);
        runHere();
      };
      w.onmessage = (e) => {
        const m = e.data;
        if (m.ready) return;
        if (m.finished) { w.terminate(); workers = workers.filter((o) => o !== w); return; }
        if (m.error) { fail(m.error); return; }
        got.add(m.kind + m.j0);
        jobs.get(m.kind).put(m.j0, m.buf);
      };
      w.onerror = (e) => { e.preventDefault?.(); fail(e.message); };
      // sent straight away: the worker picks it up as soon as it has loaded, without waiting on this thread
      w.postMessage({ list: mine });
      workers.push(w);
    }
  } catch (err) {
    console.warn('no bake workers, baking here:', err);
    runHere();
  }
  return result;
}
