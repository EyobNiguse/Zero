import { z } from 'zod';
import * as store from '../local-store';
import { publicProcedure, router } from '../trpc';

// Notes live in localStorage, not the mirror — no db or provider needed.
const noteFields = z.object({
  threadId: z.string(),
  content: z.string(),
  color: z.string().optional().default('default'),
  isPinned: z.boolean().optional().default(false),
});

export const notesRouter = router({
  list: publicProcedure
    .input(z.object({ threadId: z.string() }))
    .query(({ input }) => ({ notes: store.getThreadNotes(input.threadId) })),

  create: publicProcedure.input(noteFields).mutation(({ input }) => ({
    note: store.createNote(input, new Date().toISOString()),
  })),

  update: publicProcedure
    .input(z.object({ noteId: z.string(), data: noteFields.partial() }))
    .mutation(({ input }) => ({
      note: store.updateNote(input.noteId, input.data, new Date().toISOString()),
    })),

  delete: publicProcedure
    .input(z.object({ noteId: z.string() }))
    .mutation(({ input }) => ({ success: store.deleteNote(input.noteId) })),

  reorder: publicProcedure
    .input(
      z.object({
        notes: z.array(
          z.object({
            id: z.string(),
            order: z.number(),
            isPinned: z.boolean().optional().nullable(),
          }),
        ),
      }),
    )
    .mutation(({ input }) => ({ success: store.reorderNotes(input.notes) })),
});
