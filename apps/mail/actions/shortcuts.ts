'use server';

import { Shortcut } from '@/config/shortcuts';
import { db } from '@zero/db';
import { userHotkeys } from '@zero/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function getShortcuts(): Promise<Shortcut[]> {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user?.id) throw new Error('Unauthorized');

    const result = await db.query.userHotkeys.findFirst({
      where: (hotkeys, { eq }) => eq(hotkeys.userId, session.user.id),
    });

    return result?.shortcuts as Shortcut[] || [];
  } catch (error) {
    console.error('Error fetching shortcuts from DB:', error);
    throw error;
  }
}

export async function updateShortcuts(shortcuts: Shortcut[]): Promise<void> {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user?.id) throw new Error('Unauthorized');

    await db
      .insert(userHotkeys)
      .values({
        userId: session.user.id,
        shortcuts,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userHotkeys.userId,
        set: {
          shortcuts,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error('Error updating shortcuts in DB:', error);
    throw error;
  }
}
