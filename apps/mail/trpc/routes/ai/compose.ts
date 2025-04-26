import {
  EmailAssistantPrompt,
  MessagePrompt,
  StyledEmailAssistantSystemPrompt,
} from '@/lib/ai-composer-prompts';
import { getWritingStyleMatrixForConnectionId } from '@/services/writing-style-service';
import { activeConnectionProcedure } from '@/trpc/trpc';
import { stripHtml } from 'string-strip-html';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { generateText } from 'ai';

export const compose = activeConnectionProcedure
  .input(
    z.object({
      prompt: z.string(),
      emailSubject: z.string().optional(),
      to: z.array(z.string()).optional(),
      cc: z.array(z.string()).optional(),
      threadMessages: z
        .array(
          z.object({
            from: z.string(),
            to: z.array(z.string()),
            cc: z.array(z.string()).optional(),
            subject: z.string(),
            body: z.string(),
          }),
        )
        .optional()
        .default([]),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const { session, activeConnection } = ctx;
    const { prompt, threadMessages, cc, emailSubject, to } = input;
    const writingStyleMatrix = await getWritingStyleMatrixForConnectionId(activeConnection.id);

    console.log('writing', writingStyleMatrix);

    const systemPrompt = StyledEmailAssistantSystemPrompt();

    const userPrompt = EmailAssistantPrompt({
      currentSubject: emailSubject,
      recipients: [...(to ?? []), ...(cc ?? [])],
      prompt,
      username: session.user.name,
      styleProfile: writingStyleMatrix?.style,
    });

    const threadUserMessages = threadMessages.map((message) => {
      return {
        role: 'user',
        content: MessagePrompt({
          ...message,
          body: stripHtml(message.body).result,
        }),
      } as const;
    });

    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...(threadMessages.length > 0
          ? [
              {
                role: 'user',
                content: "I'm going to give you the current email thread replies one by one.",
              } as const,
              {
                role: 'assistant',
                content: 'Got it. Please proceed with the thread replies.',
              } as const,
              ...threadUserMessages,
              {
                role: 'user',
                content: 'Now, I will give you the prompt to write the email.',
              } as const,
            ]
          : []),
        {
          role: 'user',
          content: 'Now, I will give you the prompt to write the email.',
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      maxTokens: 1_000,
      temperature: 0.35, // controlled creativity
      frequencyPenalty: 0.2, // dampen phrase repetition
      presencePenalty: 0.1, // nudge the model to add fresh info
      maxRetries: 1,
    });

    return {
      newBody: text,
    };
  });
