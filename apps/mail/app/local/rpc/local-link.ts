import { observable } from '@trpc/server/observable';
import { TRPCClientError, type TRPCLink } from '@trpc/client';
import type { AppRouter } from '@zero/server/trpc';
import { localResolvers } from './resolvers';
import { isLocalActive } from './bridge';

export const localLink: TRPCLink<AppRouter> = () => {
  return ({ op, next }) => {
    const resolver = localResolvers[op.path];
    if (!resolver || op.type === 'subscription' || !isLocalActive()) {
      return next(op);
    }
    return observable((observer) => {
      resolver(op.input)
        .then((data) => {
          observer.next({ result: { type: 'data', data } });
          observer.complete();
        })
        .catch((err) => observer.error(TRPCClientError.from(err)));
    });
  };
};
