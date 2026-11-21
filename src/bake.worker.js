// A baking worker: builds the world once (on import), then works through its list of bands of rows, posting
// each back as it is finished. The list comes in the worker's name, so it can start the moment it has loaded,
// without waiting for a message from the page (whose thread is busy building the world just then, and would
// hold any message up until it next pauses).
import { bakeRows } from './bakers.js';

const run = (list) => {
  for (const { kind, j0, j1 } of list) {
    try {
      const buf = bakeRows(kind, j0, j1);
      self.postMessage({ kind, j0, buf }, [buf]);
    } catch (err) {
      self.postMessage({ kind, j0, j1, error: String(err?.message ?? err) });
    }
  }
  self.postMessage({ finished: true });
};
self.onmessage = (e) => run(e.data.list);
let mine = null;
try { mine = JSON.parse(self.name || 'null'); } catch { /* no list in the name: wait for a message */ }
if (mine?.list) run(mine.list);
else self.postMessage({ ready: true });
