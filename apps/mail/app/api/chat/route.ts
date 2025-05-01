import { getActiveConnection } from '@/actions/utils';
import { ToolInvocation, streamText } from 'ai';
import { type IConfig } from '../driver/types';
import { NextResponse } from 'next/server';
import { createDriver } from '../driver';
import { openai } from '@ai-sdk/openai';
import { listThreads } from './tools';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: ToolInvocation[];
}

export async function POST(req: Request) {
  const connection = await getActiveConnection();
  if (!connection) throw new Error('No active connection found');
  const { messages }: { messages: Message[] } = await req.json();
  if (!connection?.accessToken || !connection?.refreshToken) {
    console.error('Unauthorized: No valid connection found');
    return NextResponse.json({}, { status: 401 });
  }
  const driver = await createDriver(connection.providerId, {
    auth: {
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
      email: connection.email,
    },
  });

  const result = streamText({
    model: openai('gpt-4o'),
    system: `
        You are a helpful assistant.
        You are able to list email threads. Use the listThreads tool to do so.
        Parameters:
        - folder: the folder to list threads from
        - query: the search query
        - maxResults: the maximum number of results
        - labelIds: the label IDs to filter by
    `,
    messages,
    tools: {
      listThreads: listThreads(driver),
    },
  });

  return result.toDataStreamResponse();
}
