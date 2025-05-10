import { env } from 'cloudflare:workers';

export const enableBrainFunction = async (connection: { id: string; providerId: string }) => {
  const request = new Request('/subscribe/google', {
    method: 'PUT',
    body: JSON.stringify({
      connectionId: connection.id,
    }),
  });
  const outgoing = await env.zero_worker.fetch(request);
  if (outgoing.ok) {
    console.log(await outgoing.json());
  } else {
    console.log('Error subscribing to zero worker', outgoing.status, outgoing.statusText);
  }
};

export const disableBrainFunction = async (connection: { id: string; providerId: string }) => {
  return await fetch(env.BRAIN_URL + `/unsubscribe/${connection.providerId}`, {
    body: JSON.stringify({
      connectionId: connection.id,
    }),
    method: 'PUT',
  })
    .then(() => true)
    .catch(() => false);
};
