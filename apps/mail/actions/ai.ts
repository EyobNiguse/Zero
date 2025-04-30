// The brain.ts file in /actions should replace this file once ready.
'use server';

import { generateSubjectForEmail } from '@/lib/ai';
import { headers } from 'next/headers';
import { JSONContent } from 'novel';
import { auth } from '@/lib/auth';

export async function generateAISubject({ body }: { body: string }): Promise<string> {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user) {
      console.error('AI Action Error (Subject): Unauthorized');
      return '';
    }

    if (!body || body.trim() === '') {
      console.warn('AI Action Warning (Subject): Cannot generate subject for empty body.');
      return '';
    }

    const subject = await generateSubjectForEmail(body);

    console.log('--- Action Layer (Subject): Received from generateSubjectForEmail ---');
    console.log('Generated Subject:', subject);
    console.log('--- End Action Layer (Subject) Log ---');

    return subject;
  } catch (error) {
    console.error('Error in generateAISubject action:', error);
    return '';
  }
}

function createJsonContentFromBody(bodyText: string): JSONContent {
  if (!bodyText || bodyText.trim() === '') {
    bodyText = 'AI failed to generate content. Please try again.';
  }

  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: bodyText.trim() }],
      },
    ],
  };
}
