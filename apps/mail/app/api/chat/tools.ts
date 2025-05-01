import type { MailManager } from '../driver/types';

export const listThreads = (driver: MailManager) => ({
  description: 'List email threads',
  parameters: {
    type: 'object',
    properties: {
      folder: { type: 'string', description: 'Folder to list threads from' },
      query: { type: 'string', description: 'Search query' },
      maxResults: { type: 'number', description: 'Maximum number of results' },
      labelIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Label IDs to filter by',
      },
      pageToken: { type: 'string', description: 'Page token for pagination' },
    },
    required: ['folder'],
  },
  execute: async ({
    folder,
    query,
    maxResults,
    labelIds,
  }: {
    folder: string;
    query?: string;
    maxResults?: number;
    labelIds?: string[];
  }) => {
    console.log('trying to list threads');

    return driver.list(folder, query, maxResults, labelIds, undefined);
  },
});
