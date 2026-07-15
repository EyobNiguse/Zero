import { LoginClient } from './login-client';
import { useLoaderData, redirect } from 'react-router';
import type { Route } from './+types/page';

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  // Already connected in browser-first mode: bounce back to mail UNLESS the user
  // explicitly asked to switch account (?switch=1 from the Login button). This
  // absorbs any stray auto-navigation to /login without trapping real switches.
  if (typeof window !== 'undefined' && localStorage.getItem('local.provider')) {
    const wantsSwitch = new URL(request.url).searchParams.has('switch');
    if (!wantsSwitch) throw redirect('/mail/inbox');
  }

  const isProd = !import.meta.env.DEV;

  // Browser-first mode: the backend may be absent. Fall back to the two local
  // providers so the login page still renders and drives browser auth.
  const localProviders = [
    { id: 'google', name: 'Google', enabled: true },
    { id: 'microsoft', name: 'Microsoft', enabled: true },
  ];

  // Browser-first auth runs entirely client-side off the VITE_* public client ids,
  // so a provider is usable even when the backend lacks its server-side secret.
  const locallyEnabled: Record<string, boolean> = {
    google: !!import.meta.env.VITE_GOOGLE_CLIENT_ID,
    microsoft: !!import.meta.env.VITE_MS_CLIENT_ID,
  };

  try {
    const response = await fetch(import.meta.env.VITE_PUBLIC_BACKEND_URL + '/api/public/providers');
    const data = (await response.json()) as { allProviders: any[] };
    const allProviders = data.allProviders.map((p) =>
      locallyEnabled[p.id] ? { ...p, enabled: true } : p,
    );
    return { allProviders, isProd };
  } catch {
    return { allProviders: localProviders, isProd };
  }
}

export default function LoginPage() {
  const { allProviders, isProd } = useLoaderData<typeof clientLoader>();

  return (
    <div className="flex min-h-screen w-full flex-col bg-white dark:bg-black">
      <LoginClient providers={allProviders} isProd={isProd} />
    </div>
  );
}
