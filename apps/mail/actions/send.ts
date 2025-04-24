'use server';

import { createDriver } from '@/app/api/driver';
import { getActiveConnection } from './utils';
import { ISendEmail } from '@/types';

export async function sendEmail({
  to,
  subject,
  message,
  attachments,
  bcc,
  cc,
  headers: additionalHeaders = {},
  threadId,
  fromEmail,
}: ISendEmail) {
  if (!to || !subject || !message) {
    throw new Error('Missing required fields');
  }

  const connection = await getActiveConnection();

  if (!connection?.accessToken || !connection.refreshToken) {
    return null;
  }

  const driver = await createDriver(connection.providerId, {
    auth: {
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
      email: connection.email,
    },
  });

  await driver.create({
    subject,
    to,
    message,
    attachments: attachments || [],
    headers: additionalHeaders,
    cc,
    bcc,
    threadId,
    fromEmail,
  });

  return { success: true };
}
