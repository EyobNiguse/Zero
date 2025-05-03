import HomeContent from '@/components/home/HomeContent';
import Speed from '@/components/home/speed';
import { getSession } from '@/lib/auth-client';
import { redirect } from 'next/navigation';

export default async function Home() {
  //   const session = await getSession();

  //   if (session.data) {
  //     redirect('/mail/inbox');
  //   }

  return (
    <div>
    <HomeContent />
 
    </div>
  )
}
