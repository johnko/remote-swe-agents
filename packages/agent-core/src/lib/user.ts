import { getSession } from './sessions.js';

export const resolveUserId = async (workerId: string): Promise<string> => {
  const session = await getSession(workerId);
  if (!session) {
    throw new Error('Could not determine user identity from session.');
  }
  // Priority 1: senderUserId (stable email identifier)
  if (session.senderUserId) {
    return session.senderUserId;
  }
  // Priority 2: initiator (falls back to legacy behavior)
  if (!session.initiator) {
    throw new Error('Could not determine user identity from session.');
  }
  return session.initiator.includes('#') ? session.initiator.split('#').pop()! : session.initiator;
};
