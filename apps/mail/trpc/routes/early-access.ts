import { createRateLimiterMiddleware, privateProcedure, publicProcedure, router } from '../trpc';
import { goldenTicketEmail } from '@/lib/email-templates';
import { earlyAccess, user } from '@zero/db/schema';
import { Ratelimit } from '@upstash/ratelimit';
import { TRPCError } from '@trpc/server';
import { PostgresError } from 'postgres';
import { count, eq } from 'drizzle-orm';
import { resend } from '@/lib/resend';
import { z } from 'zod';

export const earlyAccessRouter = router({
  getCount: publicProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(20, '1m'),
        generatePrefix: () => 'ratelimit:early-access-count',
      }),
    )
    .query(async ({ ctx }) => {
      const { db } = ctx;
      const result = await db.select({ count: count() }).from(earlyAccess);
      const signupCount = result[0]?.count || 0;
      return { count: signupCount };
    }),
  register: publicProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(2, '10m'),
        generatePrefix: () => 'ratelimit:early-access',
      }),
    )
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const { email } = input;
      const nowDate = new Date();

      try {
        const result = await db.insert(earlyAccess).values({
          id: crypto.randomUUID(),
          email: email.toLowerCase(),
          createdAt: nowDate,
          updatedAt: nowDate,
        });

        await resend.emails.send({
          from: '0.email <onboarding@0.email>',
          to: email,
          subject: 'You <> Zero',
          text: `Congrats on joining the waitlist! We're excited to have you on board. Please expect an email from us soon with more information, we are inviting more batches of early access users every day. If you have any questions, please don't hesitate to reach out to us on Discord https://discord.gg/0email.`,
          scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        });

        console.log('Insert successful:', result);

        return { message: 'Successfully joined early access' };
      } catch (err) {
        const pgError = err as PostgresError;
        console.error('Database error:', {
          code: pgError.code,
          message: pgError.message,
          fullError: err,
        });

        if (pgError.code === '23505') {
          return { message: 'Email already registered for early access' };
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error registering early access',
        });
      }
    }),
  claimGoldenTicket: privateProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input, ctx }) => {
      const { db, session } = ctx;
      const { email } = input;

      const [foundUser] = await db
        .select({
          hasUsedTicket: earlyAccess.hasUsedTicket,
          email: user.email,
          isEarlyAccess: earlyAccess.isEarlyAccess,
        })
        .from(user)
        .leftJoin(earlyAccess, eq(user.email, earlyAccess.email))
        .where(eq(user.id, session.user.id))
        .limit(1);

      if (!foundUser) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      if (foundUser.hasUsedTicket)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Golden ticket already claimed' });

      await resend.emails.send({
        from: '0.email <onboarding@0.email>',
        to: email,
        subject: 'You <> Zero',
        html: goldenTicketEmail,
      });

      await db
        .insert(earlyAccess)
        .values({
          id: crypto.randomUUID(),
          email,
          createdAt: new Date(),
          updatedAt: new Date(),
          isEarlyAccess: true,
          hasUsedTicket: '',
        })
        .catch(async (error) => {
          console.log('Error registering early access', error);
          if (error.code === '23505') {
            console.log('Email already registered for early access, granted access');
            await db
              .update(earlyAccess)
              .set({
                hasUsedTicket: '',
                updatedAt: new Date(),
                isEarlyAccess: true,
              })
              .where(eq(earlyAccess.email, email));
          } else {
            console.error('Error registering early access', error);
            await db
              .update(earlyAccess)
              .set({
                hasUsedTicket: email,
                updatedAt: new Date(),
              })
              .where(eq(earlyAccess.email, foundUser.email))
              .catch((err) => {
                console.error('Error updating early access', err);
              });
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Error registering early access',
            });
          }
        });

      await db
        .update(earlyAccess)
        .set({
          hasUsedTicket: email,
          updatedAt: new Date(),
        })
        .where(eq(earlyAccess.email, foundUser.email));

      return { success: true };
    }),
});
