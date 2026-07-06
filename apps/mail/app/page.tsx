import HomeContent from '@/components/home/HomeContent';
import { authProxy } from '@/lib/auth-proxy';
import type { Route } from './+types/page';
import { redirect } from 'react-router';

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  // Browser-first mode: skip the server session check and go straight to mail.
  if (typeof window !== 'undefined' && localStorage.getItem('local.provider')) {
    throw redirect('/mail/inbox');
  }
  const session = await authProxy.api.getSession({ headers: request.headers }).catch(() => null);
  if (session?.user.id) throw redirect('/mail/inbox');
  return null;
}

export default function Home() {
  return <HomeContent />;
}
