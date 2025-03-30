import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query } = await request.json();

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key is not configured' }, { status: 500 });
    }

    const systemPrompt = `You are an email search query enhancer. Your job is to convert natural language queries into precise email search queries.

Rules:
1. Focus on the main term first
2. Only include secondary terms if explicitly mentioned
3. Avoid generic terms that could dilute the search
4. Use exact matches when possible
5. Keep the query simple and focused

Examples:
- "find that sls legal email" → "subject:sls OR from:sls"
- "sls legal documents" → "subject:sls OR from:sls has:attachment"
- "emails between maha and fadi" → "(from:maha OR to:maha OR subject:maha) AND (from:fadi OR to:fadi OR subject:fadi)"
- "maha fadi project" → "(from:maha OR to:maha OR subject:maha) AND (from:fadi OR to:fadi OR subject:fadi) subject:project"
- "emails about project deadline from last week" → "subject:project subject:deadline after:${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]} before:${new Date().toISOString().split('T')[0]}"

Convert this query into a precise email search query: "${query}"`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 100,
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
      throw new Error(`OpenAI API Error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await openaiResponse.json();
    const enhancedQuery = data.choices[0]?.message?.content?.trim();

    if (!enhancedQuery) {
      return NextResponse.json({ error: 'Failed to generate search query' }, { status: 500 });
    }

    return NextResponse.json({ enhancedQuery });
  } catch (error: any) {
    console.error('AI Search Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
} 