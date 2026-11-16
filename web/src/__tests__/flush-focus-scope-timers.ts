import { setTimeout as nodeSetTimeout } from "node:timers";

// Copied before tests install fake timers. Those patch `node:timers` in
// place, so waiting on the live export would never resolve.
const realSetTimeout = nodeSetTimeout;

afterAll(async () => {
  // Radix FocusScope queues a 0ms timer on unmount. The timer constructs a
  // CustomEvent and dispatches it on the scope container. Testing Library
  // cleanup unmounts at the end of the file, and the worker can close jsdom
  // before the timer runs. The callback then constructs Node's CustomEvent,
  // which jsdom rejects. Let the queued macrotask run while this environment
  // is still installed.
  await new Promise<void>((resolve) => {
    realSetTimeout(resolve, 0);
  });
});
