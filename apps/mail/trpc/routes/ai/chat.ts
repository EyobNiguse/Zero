import { generateCompletions } from '@/lib/groq';
import { privateProcedure } from '@/trpc/trpc';
import { TRPCError } from '@trpc/server';
import { CoreMessage } from 'ai';
import dedent from 'dedent';
import { z } from 'zod';

export const getCompletions = privateProcedure
  .input(
    z.object({
      messages: z.array(z.unknown()),
      context: z
        .object({
          isEmailRequest: z.boolean().optional(),
        })
        .optional(),
    }),
  )
  .query(async ({ input }) => {
    try {
      const { messages, context } = input;

      const lastMessage = (messages as CoreMessage[])[messages.length - 1]?.content;
      if (!lastMessage || typeof lastMessage !== 'string')
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'At least one message is required and must be a string',
        });

      let systemPrompt =
        'You are a helpful AI assistant. Provide clear, concise, and accurate responses.';

      // If this is an email request, modify the system prompt
      if (context?.isEmailRequest) {
        systemPrompt = dedent`
        You are an email writing assistant. Generate professional, well-structured emails.
        When generating an email, always follow this format:
        1. Keep the tone professional but friendly
        2. Be concise and clear
        3. Include a clear subject line
        4. Structure the email with a greeting, body, and closing
        5. Use appropriate formatting

        Output format:
        {
          "emailContent": "The full email content",
          "subject": "A clear subject line",
          "content": "A brief message explaining the generated email"
        }
      `;
      }

      const { completion } = await generateCompletions({
        model: 'llama3-8b-8192',
        systemPrompt,
        prompt: context?.isEmailRequest
          ? `Generate a professional email for the following request: ${lastMessage}`
          : lastMessage,
        temperature: 0.7,
        max_tokens: 500,
        userName: 'User',
      });

      // If this was an email request, try to parse the JSON response
      if (context?.isEmailRequest) {
        try {
          const emailData = JSON.parse(completion);
          return emailData;
        } catch (error) {
          // If parsing fails, return the completion as regular content
          return { content: completion };
        }
      }

      return { content: completion };
    } catch (error) {
      console.error('Chat API Error:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while processing your request',
      });
    }
  });
