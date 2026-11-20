import { getSession } from './sessions.js';

export const resolveUserId = async (workerId: string): Promise<string> => {
  const session = await getSession(workerId);
  if (!session) {
    throw new Error('Could not determine user identity from session.');
  }
  // Priority 1: initiator (Cognito sub - stable identifier, not affected by email changes)
  if (session.initiator) {
    return session.initiator.includes('#') ? session.initiator.split('#').pop()! : session.initiator;
  }
  // Priority 2: senderUserId (email - fallback for legacy sessions that may lack initiator)
  if (session.senderUserId) {
    return session.senderUserId;
  }
  throw new Error('Could not determine user identity from session.');
};
