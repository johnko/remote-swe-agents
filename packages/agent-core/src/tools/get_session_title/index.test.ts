import { describe, expect, test, vi, beforeEach } from 'vitest';

const mockGetSession = vi.fn();

vi.mock('../../lib/sessions', () => ({
  getSession: (...args: any[]) => mockGetSession(...args),
}));

import { getSessionTitleTool } from './index';

const mockContext = {
  workerId: 'test-worker-123',
  toolUseId: 'test-tool-use',
};

describe('getSessionTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns session title when set', async () => {
    mockGetSession.mockResolvedValue({
      title: 'Test Session Title',
      agentStatus: 'working',
    });

    const result = await getSessionTitleTool.handler({}, mockContext as any);

    expect(mockGetSession).toHaveBeenCalledWith('test-worker-123');
    expect(result).toBe('Test Session Title');
  });

  test('returns empty string when no title is set', async () => {
    mockGetSession.mockResolvedValue({
      title: undefined,
      agentStatus: 'working',
    });

    const result = await getSessionTitleTool.handler({}, mockContext as any);

    expect(mockGetSession).toHaveBeenCalledWith('test-worker-123');
    expect(result).toBe('');
  });

  test('returns empty string when title is null', async () => {
    mockGetSession.mockResolvedValue({
      title: null,
      agentStatus: 'working',
    });

    const result = await getSessionTitleTool.handler({}, mockContext as any);

    expect(mockGetSession).toHaveBeenCalledWith('test-worker-123');
    expect(result).toBe('');
  });

  test('throws error when session not found', async () => {
    mockGetSession.mockResolvedValue(undefined);

    await expect(getSessionTitleTool.handler({}, mockContext as any)).rejects.toThrow(
      'Session not found',
    );

    expect(mockGetSession).toHaveBeenCalledWith('test-worker-123');
  });
});
