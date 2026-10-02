/**
 * Worker entry for trace-graph ELK layout.
 *
 * elkjs ships its own worker build: loaded without a `document` (i.e. inside a
 * Worker) `elk-worker.min.js` installs its own `self.onmessage` and speaks
 * elk-api's message protocol, so hosting it IS the whole worker — the main thread
 * talks to it through `new ELK({ workerFactory })`.
 *
 * `elk.bundled.js` is NOT usable here: it takes the same branch, then exports no
 * in-process worker class, so constructing ELK inside a worker throws.
 */
import "elkjs/lib/elk-worker.min.js";
