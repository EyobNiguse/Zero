import {
	fetchNotes,
	fetchThreadNotes,
	createNote as createNoteAction,
	updateNote as updateNoteAction,
	deleteNote as deleteNoteAction,
	reorderNotes as reorderNotesAction,
} from '@/actions/notes';
import { useState, useEffect, useCallback } from 'react';
import type { Note } from '@/app/api/notes/types';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export type { Note };

export function useNotes() {
	const [notes, setNotes] = useState<Note[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const t = useTranslations();

	const fetchAllNotes = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const result = await fetchNotes();

			if (!result.success) {
				throw new Error(result.error || 'Failed to fetch notes');
			}

			setNotes(result.data || []);
		} catch (err: any) {
			console.error('Error fetching notes:', err);
			setError(err.message || 'Failed to fetch notes');
			toast.error(t('common.notes.errors.failedToLoadNotes'));
		} finally {
			setIsLoading(false);
		}
	}, [t]);

	useEffect(() => {
		fetchAllNotes();
	}, [fetchAllNotes]);

	const getNotesForThread = useCallback(
		async (threadId: string) => {
			setIsLoading(true);
			setError(null);
			try {
				const result = await fetchThreadNotes(threadId);

				if (!result.success) {
					throw new Error(result.error || 'Failed to fetch thread notes');
				}

				return result.data || [];
			} catch (err: any) {
				console.error('Error fetching thread notes:', err);
				setError(err.message || 'Failed to fetch thread notes');
				toast.error(t('common.notes.errors.failedToLoadThreadNotes'));
				return [];
			} finally {
				setIsLoading(false);
			}
		},
		[t],
	);

	const hasNotes = useCallback(
		(threadId: string) => {
			return notes.some((note) => note.threadId === threadId);
		},
		[notes],
	);

	const addNote = useCallback(
		async (threadId: string, content: string, color: string = 'default'): Promise<Note | null> => {
			setIsLoading(true);
			setError(null);
			try {
				const result = await createNoteAction({
					threadId,
					content,
					color,
					isPinned: false,
				});

				if (!result.success) {
					throw new Error(result.error || 'Failed to add note');
				}

				const newNote = result.data;
				if (newNote) {
					setNotes((prev) => [...prev, newNote]);
				}
				toast.success(t('common.notes.noteAdded'));
				return newNote || null;
			} catch (err: any) {
				console.error('Error adding note:', err);
				setError(err.message || 'Failed to add note');
				toast.error(t('common.notes.errors.failedToAddNote'));
				return null;
			} finally {
				setIsLoading(false);
			}
		},
		[t],
	);

	const editNote = useCallback(
		async (noteId: string, content: string): Promise<Note | null> => {
			setIsLoading(true);
			setError(null);
			try {
				const result = await updateNoteAction(noteId, { content });

				if (!result.success) {
					throw new Error(result.error || 'Failed to update note');
				}

				const updatedNote = result.data;
				if (updatedNote) {
					setNotes((prev) => prev.map((note) => (note.id === noteId ? updatedNote : note)));
				}
				toast.success(t('common.notes.noteUpdated'));
				return updatedNote || null;
			} catch (err: any) {
				console.error('Error updating note:', err);
				setError(err.message || 'Failed to update note');
				toast.error(t('common.notes.errors.failedToUpdateNote'));
				return null;
			} finally {
				setIsLoading(false);
			}
		},
		[t],
	);

	const deleteNote = useCallback(
		async (noteId: string) => {
			setIsLoading(true);
			setError(null);
			try {
				const result = await deleteNoteAction(noteId);

				if (!result.success) {
					throw new Error(result.error || 'Failed to delete note');
				}

				setNotes((prev) => prev.filter((note) => note.id !== noteId));
				toast.success(t('common.notes.noteDeleted'));
				return true;
			} catch (err: any) {
				console.error('Error deleting note:', err);
				setError(err.message || 'Failed to delete note');
				toast.error(t('common.notes.errors.failedToDeleteNote'));
				return false;
			} finally {
				setIsLoading(false);
			}
		},
		[t],
	);

	const togglePinNote = useCallback(
		async (noteId: string): Promise<Note | null> => {
			setIsLoading(true);
			setError(null);
			try {
				const noteToUpdate = notes.find((note) => note.id === noteId);
				if (!noteToUpdate) throw new Error('Note not found');

				const result = await updateNoteAction(noteId, {
					isPinned: noteToUpdate.isPinned ? false : true,
				});

				if (!result.success) {
					throw new Error(result.error || 'Failed to update note');
				}

				const updatedNote = result.data;
				if (updatedNote) {
					setNotes((prev) => prev.map((note) => (note.id === noteId ? updatedNote : note)));
					const pinStatus = updatedNote.isPinned
						? t('common.notes.notePinned')
						: t('common.notes.noteUnpinned');
					toast.success(pinStatus);
				}
				return updatedNote || null;
			} catch (err: any) {
				console.error('Error toggling pin status:', err);
				setError(err.message || 'Failed to update note');
				toast.error(t('common.notes.errors.failedToUpdateNote'));
				return null;
			} finally {
				setIsLoading(false);
			}
		},
		[notes, t],
	);

	const changeNoteColor = useCallback(
		async (noteId: string, color: string): Promise<Note | null> => {
			setIsLoading(true);
			setError(null);
			try {
				const result = await updateNoteAction(noteId, { color });

				if (!result.success) {
					throw new Error(result.error || 'Failed to update note color');
				}

				const updatedNote = result.data;
				if (updatedNote) {
					setNotes((prev) => prev.map((note) => (note.id === noteId ? updatedNote : note)));
				}
				toast.success(t('common.notes.colorChanged'));
				return updatedNote || null;
			} catch (err: any) {
				console.error('Error changing note color:', err);
				setError(err.message || 'Failed to update note color');
				toast.error(t('common.notes.errors.failedToUpdateNoteColor'));
				return null;
			} finally {
				setIsLoading(false);
			}
		},
		[t],
	);

	const reorderNotes = useCallback(
		async (
			reorderedNotes: { id: string; order: number; isPinned?: boolean }[],
		): Promise<boolean> => {
			if (!reorderedNotes || reorderedNotes.length === 0) {
				console.warn('Attempted to reorder an empty array of notes');
				return true;
			}

			setIsLoading(true);
			setError(null);
			try {
				const validNoteIds = new Set(notes.map((note) => note.id));
				const allNotesValid = reorderedNotes.every((note) => validNoteIds.has(note.id));

				if (!allNotesValid) {
					console.warn('Some notes in reorder request do not exist locally, filtering them out');
					const validNotes = reorderedNotes.filter((note) => validNoteIds.has(note.id));

					if (validNotes.length === 0) {
						console.error('No valid notes to reorder after filtering');
						toast.error(t('common.notes.errors.noValidNotesToReorder'));
						return false;
					}

					reorderedNotes = validNotes;
				}

				setNotes((prev) => {
					const updatedNotes = [...prev];
					reorderedNotes.forEach(({ id, order, isPinned }) => {
						const index = updatedNotes.findIndex((note) => note.id === id);
						if (index !== -1) {
							const currentNote = updatedNotes[index];
							if (currentNote) {
								updatedNotes[index] = {
									...currentNote,
									order,
									isPinned: isPinned !== undefined ? isPinned : currentNote.isPinned,
								};
							}
						}
					});
					return [...updatedNotes].sort((a, b) => {
						if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
						return a.order - b.order;
					});
				});

				console.log('Sending reorder request to server:', reorderedNotes);
				const result = await reorderNotesAction(reorderedNotes);

				if (!result.success) {
					throw new Error(result.error || 'Failed to reorder notes');
				}

				toast.success(t('common.notes.notesReordered'));
				return true;
			} catch (err: any) {
				console.error('Error reordering notes:', err);
				setError(err.message || 'Failed to reorder notes');
				toast.error(t('common.notes.errors.failedToReorderNotes'));

				fetchAllNotes().catch((e) =>
					console.error('Failed to refresh notes after reorder error:', e),
				);

				return false;
			} finally {
				setIsLoading(false);
			}
		},
		[notes, fetchAllNotes, t],
	);

	return {
		notes,
		isLoading,
		error,
		fetchNotes: fetchAllNotes,
		getNotesForThread,
		hasNotes,
		addNote,
		editNote,
		deleteNote,
		togglePinNote,
		changeNoteColor,
		reorderNotes,
	};
}
