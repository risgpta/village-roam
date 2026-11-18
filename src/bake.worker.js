// A baking worker: builds the world once (on import), then works through its list of bands of rows, posting
// each back as it is finished. The whole list arrives at once, so it never has to wait on the main thread.
import { bakeRows } from './bakers.js';

self.onmessage = (e) => {
  for (const { kind, j0, j1 } of e.data.list) {
    try {
      const buf = bakeRows(kind, j0, j1);
      self.postMessage({ kind, j0, buf }, [buf]);
    } catch (err) {
      self.postMessage({ kind, j0, j1, error: String(err?.message ?? err) });
    }
  }
  self.postMessage({ finished: true });
};
self.postMessage({ ready: true });
