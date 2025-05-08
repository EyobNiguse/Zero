import { authClient } from './auth-client';

export const authProxy = {
  api: {
    getSession: async ({ headers }: { headers: Headers }) => {
      console.log('getSession', headers);
      const session = await authClient.getSession({ fetchOptions: { headers } });
      console.log('session', session);
      if (session.error) throw new Error(session.error.message);
      return session.data;
    },
  },
};
