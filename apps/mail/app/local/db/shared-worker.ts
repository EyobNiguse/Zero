/**
 * SharedWorker entry — the DB owner when the browser supports it.
 *
 * The OPFS SAH-pool VFS holds one exclusive handle on the database file, so only one worker in the
 * whole origin can own it. A SharedWorker is that one: every tab connects a port here instead of
 * spawning its own worker and losing the race to an in-memory fallback.
 *
 * Ports also carry change notifications between tabs — see ./client.ts and ../rpc/dedupe.ts.
 */
import { handle, type RequestMsg } from './engine';

const ports = new Set<MessagePort>();

interface NotifyMsg {
  kind: 'notify';
}

// `SharedWorkerGlobalScope` needs the "webworker" lib, which conflicts with "dom" in this app's
// tsconfig — the one member we touch is narrower than pulling that in.
declare const self: { onconnect: (e: MessageEvent) => void };

self.onconnect = (e: MessageEvent) => {
  const port = e.ports[0]!;
  ports.add(port);

  port.onmessage = async (ev: MessageEvent<RequestMsg | NotifyMsg>) => {
    const msg = ev.data;

    // A tab wrote to the mirror. Tell the others — they share this database, so their caches are
    // stale, and nothing else would tell them.
    if (msg.kind === 'notify') {
      for (const p of ports) if (p !== port) p.postMessage({ kind: 'notify' });
      return;
    }

    port.postMessage(await handle(msg));
  };

  port.start();
};
