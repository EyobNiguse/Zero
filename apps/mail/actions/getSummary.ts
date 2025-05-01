'use server';
import { getAuthenticatedUserId } from '@/app/api/utils';
import { getActiveConnection } from './utils';
import axios from 'axios';

export const GetSummary = async (threadId: string) => {
  try {
    await getAuthenticatedUserId();
    if (!process.env.BRAIN_URL) {
      return null;
    }

    const response = await axios.get(process.env.BRAIN_URL + `/brain/thread/summary/${threadId}`);

    return response.data ?? null;
  } catch (error) {
    console.error('Error getting summary:', error);
    return null;
  }
};

export const GetState = async () => {
  try {
    if (!process.env.BRAIN_URL) {
      return null;
    }
    const connection = await getActiveConnection();
    if (!connection) {
      return null;
    }

    const response = await axios.get(process.env.BRAIN_URL + `/limit/${connection.id}`);
    return response.data ?? null;
  } catch (error) {
    console.error('Error getting summary:', error);
    return null;
  }
};
