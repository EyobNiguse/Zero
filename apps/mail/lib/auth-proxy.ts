import { authClient } from './auth-client';

export const authProxy = {
  api: {
    getSession: async ({ headers }: { headers: Headers }) => {
      console.error('getSession', headers);
      const session = await authClient.getSession({
        fetchOptions: { headers, credentials: 'include' },
      });
      console.error('session', session);
      if (session.error) throw new Error(session.error.message);
      return session.data;
    },
  },
};
