import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createHookTool, updateHookTool, deleteHookTool } from './index.js';
import * as hooksModule from '../../lib/hooks.js';
import * as sessionsModule from '../../lib/sessions.js';
import { Hook } from '../../schema/hook.js';

vi.mock('../../lib/hooks.js');
vi.mock('../../lib/sessions.js');

describe('manage-hooks lifecycle constraints', () => {
  const mockCreateHook = vi.mocked(hooksModule.createHook);
  const mockUpdateHook = vi.mocked(hooksModule.updateHook);
  const mockGetHook = vi.mocked(hooksModule.getHook);
  const mockDeleteHook = vi.mocked(hooksModule.deleteHook);
  const mockGetSession = vi.mocked(sessionsModule.getSession);

  const mockContext = {
    workerId: 'test-session-id',
    session: {} as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      initiator: 'slack#test-user',
    } as any);
  });

  describe('create_hook', () => {
    test('creates hook with isActive: false by default', async () => {
      const mockHook: Hook = {
        PK: 'hook-test-user',
        SK: 'hook-123',
        name: 'test-hook',
        event: 'sessionStart',
        command: 'echo "test"',
        isActive: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockCreateHook.mockResolvedValue(mockHook);

      const result = await createHookTool.handler(
        {
          name: 'test-hook',
          event: 'sessionStart',
          command: 'echo "test"',
        },
        mockContext
      );

      expect(mockCreateHook).toHaveBeenCalledWith(
        'test-user',
        expect.objectContaining({
          isActive: false,
        })
      );
      expect(result).toContain('created successfully');
      expect(result).toContain('hook-123');
    });

    test('does not accept isActive parameter', async () => {
      const mockHook: Hook = {
        PK: 'hook-test-user',
        SK: 'hook-123',
        name: 'test-hook',
        event: 'sessionStart',
        command: 'echo "test"',
        isActive: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockCreateHook.mockResolvedValue(mockHook);

      await createHookTool.handler(
        {
          name: 'test-hook',
          event: 'sessionStart',
          command: 'echo "test"',
        },
        mockContext
      );

      // Verify isActive is always false even if someone tries to pass it
      const callArgs = mockCreateHook.mock.calls[0];
      expect(callArgs[1].isActive).toBe(false);
    });
  });

  describe('update_hook', () => {
    test('does not update isActive', async () => {
      const mockHook: Hook = {
        PK: 'hook-test-user',
        SK: 'hook-123',
        name: 'updated-name',
        event: 'sessionStart',
        command: 'echo "test"',
        isActive: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockUpdateHook.mockResolvedValue(mockHook);

      await updateHookTool.handler(
        {
          hookId: 'hook-123',
          name: 'updated-name',
        },
        mockContext
      );

      const callArgs = mockUpdateHook.mock.calls[0];
      expect(callArgs[2]).not.toHaveProperty('isActive');
    });
  });

  describe('delete_hook', () => {
    test('allows deleting inactive hooks', async () => {
      mockGetHook.mockResolvedValue({
        PK: 'hook-test-user',
        SK: 'hook-123',
        name: 'test-hook',
        event: 'sessionStart',
        command: 'echo "test"',
        isActive: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = await deleteHookTool.handler(
        { hookId: 'hook-123' },
        mockContext
      );

      expect(mockDeleteHook).toHaveBeenCalledWith('test-user', 'hook-123');
      expect(result).toContain('deleted successfully');
    });

    test('blocks deleting active hooks', async () => {
      mockGetHook.mockResolvedValue({
        PK: 'hook-test-user',
        SK: 'hook-123',
        name: 'test-hook',
        event: 'sessionStart',
        command: 'echo "test"',
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = await deleteHookTool.handler(
        { hookId: 'hook-123' },
        mockContext
      );

      expect(mockDeleteHook).not.toHaveBeenCalled();
      expect(result).toContain('Cannot delete an active hook');
    });

    test('returns error when hook not found', async () => {
      mockGetHook.mockResolvedValue(undefined);

      const result = await deleteHookTool.handler(
        { hookId: 'non-existent' },
        mockContext
      );

      expect(mockDeleteHook).not.toHaveBeenCalled();
      expect(result).toContain('not found');
    });
  });
});
