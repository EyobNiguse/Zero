import { observable } from '@trpc/server/observable';
import { TRPCClientError, type TRPCLink } from '@trpc/client';
import type { AppRouter } from '@zero/server/trpc';
import { localResolvers } from './resolvers';
import { isLocalActive, isLocalPending, whenActive } from './bridge';

export const localLink: TRPCLink<AppRouter> = () => {
  return ({ op, next }) => {
    const resolver = localResolvers[op.path];
    if (!resolver || op.type === 'subscription') return next(op);

    // Not local mode at all: pass through to the real backend.
    if (!isLocalActive() && !isLocalPending()) return next(op);

    return observable((observer) => {
      // If a query fires mid-activation, wait for the driver (bounded by a timeout) instead of racing the absent backend.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const wait = isLocalActive()
        ? Promise.resolve()
        : new Promise<void>((resolve, reject) => {
            timer = setTimeout(() => reject(new Error('local activation timed out')), 15000);
            whenActive().then(() => {
              clearTimeout(timer);
              resolve();
            });
          });
      wait
        .then(() => resolver(op.input))
        .then((data) => {
          observer.next({ result: { type: 'data', data } });
          observer.complete();
        })
        .catch((err) => observer.error(TRPCClientError.from(err)));
    });
  };
};
