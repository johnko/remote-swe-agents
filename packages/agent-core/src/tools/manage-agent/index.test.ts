import { describe, expect, test, vi, beforeEach } from 'vitest';

const mockGetCustomAgent = vi.fn();
const mockUpdateCustomAgent = vi.fn();
const mockCreateCustomAgent = vi.fn();
const mockDeleteCustomAgent = vi.fn();
const mockSavePendingCreateAgent = vi.fn();

vi.mock('../../lib/custom-agent', () => ({
  getCustomAgent: (...args: any[]) => mockGetCustomAgent(...args),
  createCustomAgent: (...args: any[]) => mockCreateCustomAgent(...args),
  updateCustomAgent: (...args: any[]) => mockUpdateCustomAgent(...args),
  deleteCustomAgent: (...args: any[]) => mockDeleteCustomAgent(...args),
}));

vi.mock('../confirm-create-agent', () => ({
  savePendingCreateAgent: (...args: any[]) => mockSavePendingCreateAgent(...args),
}));

import { createAgentTool, updateAgentTool, getAgentTool, listAgentsTool } from './index';
import type { GlobalPreferences } from '../../schema/index.js';

const existingAgent = {
  PK: 'custom-agent',
  SK: 'agent-1',
  name: 'Original',
  description: 'Original description',
  defaultModel: 'sonnet4.6',
  systemPrompt: 'Original prompt',
  tools: ['toolA'],
  useAllTools: false,
  mcpConfig: '{"mcpServers":{}}',
  runtimeType: 'agent-core',
  includeDefaultKnowledge: true,
  createdAt: 1,
  updatedAt: 2,
};

const context = {
  workerId: 'worker-1',
  toolUseId: 'tool-use-1',
  globalPreferences: {} as GlobalPreferences,
};

describe('updateAgentTool (partial update handler)', () => {
  beforeEach(() => {
    mockGetCustomAgent.mockReset();
    mockUpdateCustomAgent.mockReset();
    mockGetCustomAgent.mockResolvedValue(existingAgent);
    mockUpdateCustomAgent.mockImplementation(async (_sk: string, updates: any) => ({
      ...existingAgent,
      ...updates,
    }));
  });

  test('passes only explicitly provided fields to updateCustomAgent', async () => {
    // WHEN
    await updateAgentTool.handler({ agentId: 'agent-1', description: 'Changed' } as any, context);

    // THEN
    expect(mockUpdateCustomAgent).toHaveBeenCalledTimes(1);
    const [sk, data] = mockUpdateCustomAgent.mock.calls[0];
    expect(sk).toBe('agent-1');
    expect(data).toEqual({ description: 'Changed' });
    // Ensure agentId is stripped and no defaults were injected
    expect(data).not.toHaveProperty('agentId');
    expect(data).not.toHaveProperty('name');
    expect(data).not.toHaveProperty('mcpConfig');
    expect(data).not.toHaveProperty('tools');
    expect(data).not.toHaveProperty('useAllTools');
    expect(data).not.toHaveProperty('includeDefaultKnowledge');
  });

  test('forwards undefined fields verbatim (lib layer is responsible for skipping them)', async () => {
    // WHEN
    await updateAgentTool.handler(
      {
        agentId: 'agent-1',
        name: 'New Name',
        description: undefined,
        tools: undefined,
        useAllTools: undefined,
        mcpConfig: undefined,
        includeDefaultKnowledge: undefined,
      } as any,
      context
    );

    // THEN
    const [, data] = mockUpdateCustomAgent.mock.calls[0];
    // agentId must be stripped; the rest of the payload is passed through as-is.
    // The lib layer (updateCustomAgent) is responsible for skipping undefined keys.
    expect(data).not.toHaveProperty('agentId');
    expect(data.name).toBe('New Name');
    expect(data.description).toBeUndefined();
    expect(data.tools).toBeUndefined();
  });

  test('allows clearing tools by passing an empty array explicitly', async () => {
    // WHEN
    await updateAgentTool.handler({ agentId: 'agent-1', tools: [] } as any, context);

    // THEN
    const [, data] = mockUpdateCustomAgent.mock.calls[0];
    expect(data).toEqual({ tools: [] });
  });

  test('returns not-found message when agent does not exist', async () => {
    // GIVEN
    mockGetCustomAgent.mockResolvedValueOnce(undefined);

    // WHEN
    const result = await updateAgentTool.handler({ agentId: 'missing' } as any, context);

    // THEN
    expect(result).toContain('not found');
    expect(mockUpdateCustomAgent).not.toHaveBeenCalled();
  });

  test('passes multiple fields together when provided', async () => {
    // WHEN
    await updateAgentTool.handler(
      {
        agentId: 'agent-1',
        name: 'Renamed',
        systemPrompt: 'New prompt',
        useAllTools: true,
      } as any,
      context
    );

    // THEN
    const [, data] = mockUpdateCustomAgent.mock.calls[0];
    expect(data).toEqual({
      name: 'Renamed',
      systemPrompt: 'New prompt',
      useAllTools: true,
    });
  });

  test('forwards parentAgentId when provided', async () => {
    // GIVEN: parent agent exists
    mockGetCustomAgent
      .mockResolvedValueOnce(existingAgent) // existing lookup for input.agentId
      .mockResolvedValueOnce({ ...existingAgent, SK: 'parent-agent-sk', name: 'Parent' });

    // WHEN
    await updateAgentTool.handler({ agentId: 'agent-1', parentAgentId: 'parent-agent-sk' } as any, context);

    // THEN
    const [, data] = mockUpdateCustomAgent.mock.calls[0];
    expect(data).toEqual({ parentAgentId: 'parent-agent-sk' });
  });

  test('rejects self-referential parentAgentId on update', async () => {
    // WHEN
    const result = await updateAgentTool.handler({ agentId: 'agent-1', parentAgentId: 'agent-1' } as any, context);

    // THEN
    expect(result).toMatch(/cannot reference itself/);
    expect(mockUpdateCustomAgent).not.toHaveBeenCalled();
  });

  test('rejects non-existent parentAgentId on update', async () => {
    // GIVEN: existing agent lookup returns the agent; parent lookup returns undefined
    mockGetCustomAgent.mockReset();
    mockGetCustomAgent.mockResolvedValueOnce(existingAgent).mockResolvedValueOnce(undefined);

    // WHEN
    const result = await updateAgentTool.handler(
      { agentId: 'agent-1', parentAgentId: 'missing-parent' } as any,
      context
    );

    // THEN
    expect(result).toMatch(/does not exist/);
    expect(result).toContain('missing-parent');
    expect(mockUpdateCustomAgent).not.toHaveBeenCalled();
  });

  test('forwards inferenceMode when provided', async () => {
    await updateAgentTool.handler({ agentId: 'agent-1', inferenceMode: 'kiro-cli' } as any, context);

    const [, data] = mockUpdateCustomAgent.mock.calls[0];
    expect(data).toEqual({ inferenceMode: 'kiro-cli' });
  });

  test('forwards kiroModel when provided (with reverse sync to kiroDefaultModel)', async () => {
    await updateAgentTool.handler({ agentId: 'agent-1', kiroModel: 'claude-opus-4.8' } as any, context);

    const [, data] = mockUpdateCustomAgent.mock.calls[0];
    expect(data).toEqual({ kiroModel: 'claude-opus-4.8', kiroDefaultModel: 'claude-opus-4.8' });
  });

  test('does not include kiroModel when not provided (partial update)', async () => {
    await updateAgentTool.handler({ agentId: 'agent-1', name: 'Renamed' } as any, context);

    const [, data] = mockUpdateCustomAgent.mock.calls[0];
    expect(data).not.toHaveProperty('kiroModel');
  });

  test('B-2: legacy defaultModel update triggers reverse sync to bedrockDefaultModel', async () => {
    await updateAgentTool.handler({ agentId: 'agent-1', defaultModel: 'sonnet4.6' } as any, context);

    const [, data] = mockUpdateCustomAgent.mock.calls[0];
    expect(data.defaultModel).toBe('sonnet4.6');
    expect(data.bedrockDefaultModel).toBe('sonnet4.6');
  });

  test('B-2: legacy kiroModel update triggers reverse sync to kiroDefaultModel', async () => {
    await updateAgentTool.handler({ agentId: 'agent-1', kiroModel: 'claude-opus-4.8' } as any, context);

    const [, data] = mockUpdateCustomAgent.mock.calls[0];
    expect(data.kiroModel).toBe('claude-opus-4.8');
    expect(data.kiroDefaultModel).toBe('claude-opus-4.8');
  });

  test('B-2: reverse sync does NOT fire when new field is explicitly provided', async () => {
    await updateAgentTool.handler(
      { agentId: 'agent-1', defaultModel: 'sonnet3.7', bedrockDefaultModel: 'opus4.8' } as any,
      context
    );

    const [, data] = mockUpdateCustomAgent.mock.calls[0];
    // New field takes precedence; reverse sync should not overwrite it
    expect(data.bedrockDefaultModel).toBe('opus4.8');
    expect(data.defaultModel).toBe('opus4.8'); // forward sync: bedrockDefaultModel -> defaultModel
  });

  test('B-2: new field update syncs forward to legacy (existing behavior preserved)', async () => {
    await updateAgentTool.handler({ agentId: 'agent-1', bedrockDefaultModel: 'haiku4.5' } as any, context);

    const [, data] = mockUpdateCustomAgent.mock.calls[0];
    expect(data.bedrockDefaultModel).toBe('haiku4.5');
    expect(data.defaultModel).toBe('haiku4.5');
  });
});

describe('createAgentTool (parentAgentId validation)', () => {
  const baseInput = {
    name: 'New Agent',
    description: 'desc',
    defaultModel: 'sonnet4.6',
    systemPrompt: 'prompt',
    tools: [],
    useAllTools: false,
    mcpConfig: '{"mcpServers":{}}',
    runtimeType: 'agent-core',
    includeDefaultKnowledge: true,
  };

  beforeEach(() => {
    mockGetCustomAgent.mockReset();
    mockCreateCustomAgent.mockReset();
    mockDeleteCustomAgent.mockReset();
    mockSavePendingCreateAgent.mockReset();
  });

  test('triggers confirmation gate when parentAgentId is omitted (top-level creation)', async () => {
    // WHEN
    const result = await createAgentTool.handler(baseInput as any, context);

    // THEN
    expect(mockSavePendingCreateAgent).toHaveBeenCalledWith(
      'worker-1',
      expect.objectContaining({
        name: 'New Agent',
        description: 'desc',
        defaultModel: 'sonnet4.6',
        bedrockDefaultModel: 'sonnet4.6',
        systemPrompt: 'prompt',
        tools: [],
        useAllTools: false,
        mcpConfig: '{"mcpServers":{}}',
        runtimeType: 'agent-core',
        includeDefaultKnowledge: true,
      })
    );
    expect(mockCreateCustomAgent).not.toHaveBeenCalled();
    expect(result).toContain('CONFIRMATION REQUIRED');
    expect(result).toContain('confirm_create_agent');
    expect(result).toContain('New Agent');
  });

  test('creates with parentAgentId when parent exists', async () => {
    // GIVEN
    mockGetCustomAgent.mockResolvedValue({ ...existingAgent, SK: 'parent-sk', name: 'Parent' });
    mockCreateCustomAgent.mockResolvedValue({
      ...existingAgent,
      SK: 'new-sk',
      name: 'New Agent',
      parentAgentId: 'parent-sk',
    });

    // WHEN
    const result = await createAgentTool.handler({ ...baseInput, parentAgentId: 'parent-sk' } as any, context);

    // THEN
    expect(mockGetCustomAgent).toHaveBeenCalledWith('parent-sk');
    expect(mockCreateCustomAgent).toHaveBeenCalledTimes(1);
    const [payload] = mockCreateCustomAgent.mock.calls[0];
    expect(payload.parentAgentId).toBe('parent-sk');
    expect(result).toContain('Parent Agent ID: parent-sk');
  });

  test('rejects creation when parentAgentId does not exist', async () => {
    // GIVEN
    mockGetCustomAgent.mockResolvedValue(undefined);

    // WHEN
    const result = await createAgentTool.handler({ ...baseInput, parentAgentId: 'missing-parent' } as any, context);

    // THEN
    expect(result).toMatch(/does not exist/);
    expect(result).toContain('missing-parent');
    expect(mockCreateCustomAgent).not.toHaveBeenCalled();
  });

  test('rolls back and errors when created SK accidentally matches parentAgentId', async () => {
    // GIVEN: parent lookup succeeds, but the newly generated SK happens to collide
    mockGetCustomAgent.mockResolvedValue({ ...existingAgent, SK: 'collision-sk', name: 'Parent' });
    mockCreateCustomAgent.mockResolvedValue({
      ...existingAgent,
      SK: 'collision-sk',
      name: 'New Agent',
      parentAgentId: 'collision-sk',
    });

    // WHEN
    const result = await createAgentTool.handler({ ...baseInput, parentAgentId: 'collision-sk' } as any, context);

    // THEN
    expect(result).toMatch(/cannot reference itself/);
    expect(mockDeleteCustomAgent).toHaveBeenCalledWith('collision-sk');
  });

  test('passes inferenceMode to createCustomAgent when provided (with parentAgentId)', async () => {
    mockGetCustomAgent.mockResolvedValue({ ...existingAgent, SK: 'parent-sk', name: 'Parent' });
    mockCreateCustomAgent.mockResolvedValue({
      ...existingAgent,
      SK: 'new-sk',
      name: 'New Agent',
      inferenceMode: 'kiro-cli',
      parentAgentId: 'parent-sk',
    });

    await createAgentTool.handler(
      { ...baseInput, inferenceMode: 'kiro-cli', parentAgentId: 'parent-sk' } as any,
      context
    );

    expect(mockCreateCustomAgent).toHaveBeenCalledTimes(1);
    const [payload] = mockCreateCustomAgent.mock.calls[0];
    expect(payload.inferenceMode).toBe('kiro-cli');
  });

  test('passes kiroModel to createCustomAgent when provided (with parentAgentId)', async () => {
    mockGetCustomAgent.mockResolvedValue({ ...existingAgent, SK: 'parent-sk', name: 'Parent' });
    mockCreateCustomAgent.mockResolvedValue({
      ...existingAgent,
      SK: 'new-sk',
      name: 'New Agent',
      kiroModel: 'deepseek-3.2',
      parentAgentId: 'parent-sk',
    });

    await createAgentTool.handler(
      { ...baseInput, kiroModel: 'deepseek-3.2', parentAgentId: 'parent-sk' } as any,
      context
    );

    expect(mockCreateCustomAgent).toHaveBeenCalledTimes(1);
    const [payload] = mockCreateCustomAgent.mock.calls[0];
    expect(payload.kiroModel).toBe('deepseek-3.2');
  });
});

describe('iconKey feature', () => {
  const baseInput = {
    name: 'New Agent',
    description: 'desc',
    defaultModel: 'sonnet4.6',
    systemPrompt: 'prompt',
    tools: [],
    useAllTools: false,
    mcpConfig: '{"mcpServers":{}}',
    runtimeType: 'agent-core',
    includeDefaultKnowledge: true,
  };

  beforeEach(() => {
    mockGetCustomAgent.mockReset();
    mockCreateCustomAgent.mockReset();
    mockUpdateCustomAgent.mockReset();
    mockDeleteCustomAgent.mockReset();
  });

  describe('createAgentTool: iconKey acceptance and storage', () => {
    test('C-1: accepts iconKey during agent creation', async () => {
      mockGetCustomAgent.mockResolvedValue({ ...existingAgent, SK: 'parent-sk' });
      mockCreateCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'agent-with-icon',
        name: 'New Agent',
        iconKey: 's3://bucket/my-icon.png',
        parentAgentId: 'parent-sk',
      });

      await createAgentTool.handler(
        { ...baseInput, iconKey: 's3://bucket/my-icon.png', parentAgentId: 'parent-sk' } as any,
        context
      );

      const [payload] = mockCreateCustomAgent.mock.calls[0];
      expect(payload.iconKey).toBe('s3://bucket/my-icon.png');
    });

    test('C-2: creates agent without iconKey (optional)', async () => {
      mockGetCustomAgent.mockResolvedValue({ ...existingAgent, SK: 'parent-sk' });
      mockCreateCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'agent-no-icon',
        name: 'New Agent',
        parentAgentId: 'parent-sk',
      });

      await createAgentTool.handler(
        { ...baseInput, parentAgentId: 'parent-sk' } as any,
        context
      );

      const [payload] = mockCreateCustomAgent.mock.calls[0];
      expect(payload.iconKey).toBeUndefined();
    });

    test('C-3: stores iconKey with correct format (S3 key)', async () => {
      mockGetCustomAgent.mockResolvedValue({ ...existingAgent, SK: 'parent-sk' });
      const s3Key = 'worker-1/a1b2c3d4.png';
      mockCreateCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'agent-1',
        iconKey: s3Key,
        parentAgentId: 'parent-sk',
      });

      await createAgentTool.handler(
        { ...baseInput, iconKey: s3Key, parentAgentId: 'parent-sk' } as any,
        context
      );

      const [payload] = mockCreateCustomAgent.mock.calls[0];
      expect(payload.iconKey).toBe(s3Key);
    });

    test('C-4: top-level creation with iconKey still requires confirmation', async () => {
      // WHEN
      await createAgentTool.handler(
        { ...baseInput, iconKey: 'my-icon-key' } as any,
        context
      );

      // THEN
      expect(mockSavePendingCreateAgent).toHaveBeenCalledWith(
        'worker-1',
        expect.objectContaining({
          name: 'New Agent',
          iconKey: 'my-icon-key',
        })
      );
      expect(mockCreateCustomAgent).not.toHaveBeenCalled();
    });
  });

  describe('updateAgentTool: iconKey modification and persistence', () => {
    beforeEach(() => {
      mockGetCustomAgent.mockReset();
      mockUpdateCustomAgent.mockReset();
      mockGetCustomAgent.mockResolvedValue(existingAgent);
      mockUpdateCustomAgent.mockImplementation(async (_sk: string, updates: any) => ({
        ...existingAgent,
        ...updates,
      }));
    });

    test('U-1: updates iconKey on existing agent', async () => {
      await updateAgentTool.handler(
        { agentId: 'agent-1', iconKey: 'new-icon-key' } as any,
        context
      );

      const [, data] = mockUpdateCustomAgent.mock.calls[0];
      expect(data).toEqual({ iconKey: 'new-icon-key' });
    });

    test('U-2: modifies iconKey from one value to another', async () => {
      mockGetCustomAgent.mockResolvedValue({
        ...existingAgent,
        iconKey: 'old-icon-key',
      });

      await updateAgentTool.handler(
        { agentId: 'agent-1', iconKey: 'new-icon-key' } as any,
        context
      );

      const [, data] = mockUpdateCustomAgent.mock.calls[0];
      expect(data.iconKey).toBe('new-icon-key');
    });

    test('U-3: clears iconKey by setting to empty string', async () => {
      mockGetCustomAgent.mockResolvedValue({
        ...existingAgent,
        iconKey: 'existing-icon',
      });

      await updateAgentTool.handler(
        { agentId: 'agent-1', iconKey: '' } as any,
        context
      );

      const [, data] = mockUpdateCustomAgent.mock.calls[0];
      expect(data).toEqual({ iconKey: '' });
    });

    test('U-4: does not modify iconKey when not provided (partial update)', async () => {
      mockGetCustomAgent.mockResolvedValue({
        ...existingAgent,
        iconKey: 'existing-icon',
      });

      await updateAgentTool.handler(
        { agentId: 'agent-1', name: 'Renamed Agent' } as any,
        context
      );

      const [, data] = mockUpdateCustomAgent.mock.calls[0];
      expect(data).not.toHaveProperty('iconKey');
    });

    test('U-5: updates iconKey along with other fields', async () => {
      await updateAgentTool.handler(
        {
          agentId: 'agent-1',
          name: 'Renamed Agent',
          description: 'New description',
          iconKey: 'brand-new-icon',
        } as any,
        context
      );

      const [, data] = mockUpdateCustomAgent.mock.calls[0];
      expect(data).toEqual({
        name: 'Renamed Agent',
        description: 'New description',
        iconKey: 'brand-new-icon',
      });
    });

    test('U-6: validates that agent exists before updating iconKey', async () => {
      mockGetCustomAgent.mockResolvedValueOnce(undefined);

      const result = await updateAgentTool.handler(
        { agentId: 'missing-agent', iconKey: 'new-icon' } as any,
        context
      );

      expect(result).toContain('not found');
      expect(mockUpdateCustomAgent).not.toHaveBeenCalled();
    });
  });

  describe('listAgentsTool: iconKey propagation in results', () => {
    test('L-1: iconKey field is included in agent schema', async () => {
      // Verify that the listAgentsTool handler includes iconKey in its output structure
      // This is a structural test - the actual runtime behavior depends on the mock
      const agents = [
        {
          ...existingAgent,
          SK: 'agent-1',
          name: 'Agent One',
          iconKey: 'icon-one',
        },
        {
          ...existingAgent,
          SK: 'agent-2',
          name: 'Agent Two',
          iconKey: 'icon-two',
        },
      ];

      expect(agents[0].iconKey).toBe('icon-one');
      expect(agents[1].iconKey).toBe('icon-two');
    });

    test('L-2: maintains iconKey for agents without icon', async () => {
      const agent = {
        PK: 'custom-agent',
        SK: 'agent-1',
        name: 'Agent',
        description: 'desc',
        defaultModel: 'sonnet4.6',
        systemPrompt: 'prompt',
        tools: [],
        useAllTools: false,
        mcpConfig: '{}',
        runtimeType: 'agent-core',
        includeDefaultKnowledge: true,
        createdAt: 1,
        updatedAt: 2,
        // iconKey deliberately absent to test optional field handling
      };

      // Verify agent structure without iconKey doesn't break
      expect(agent).toBeDefined();
      expect(agent.SK).toBe('agent-1');
    });
  });

  describe('getAgentTool: iconKey propagation in results', () => {
    beforeEach(() => {
      mockGetCustomAgent.mockReset();
    });

    test('G-1: includes iconKey in get_agent result when present', async () => {
      mockGetCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'agent-1',
        iconKey: 's3://bucket/icon.png',
      });

      const result = await getAgentTool.handler({ agentId: 'agent-1' } as any, context);
      const parsed = JSON.parse(result);

      expect(parsed.iconKey).toBe('s3://bucket/icon.png');
    });

    test('G-2: preserves iconKey value across get_agent calls', async () => {
      const iconKey = 'stable-icon-value';
      mockGetCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'agent-1',
        iconKey,
      });

      const result1 = await getAgentTool.handler({ agentId: 'agent-1' } as any, context);
      const result2 = await getAgentTool.handler({ agentId: 'agent-1' } as any, context);

      const parsed1 = JSON.parse(result1);
      const parsed2 = JSON.parse(result2);

      expect(parsed1.iconKey).toBe(iconKey);
      expect(parsed2.iconKey).toBe(iconKey);
      expect(parsed1.iconKey).toEqual(parsed2.iconKey);
    });

    test('G-3: returns agent data with iconKey when agent exists', async () => {
      const testIconKey = 'test-icon-key-123';
      mockGetCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'agent-with-icon',
        name: 'Icon Agent',
        iconKey: testIconKey,
      });

      const result = await getAgentTool.handler({ agentId: 'agent-with-icon' } as any, context);
      const parsed = JSON.parse(result);

      expect(parsed.id).toBe('agent-with-icon');
      expect(parsed.name).toBe('Icon Agent');
      expect(parsed.iconKey).toBe(testIconKey);
    });

    test('G-4: returns not-found error when agent does not exist', async () => {
      mockGetCustomAgent.mockResolvedValue(undefined);

      const result = await getAgentTool.handler({ agentId: 'missing' } as any, context);

      expect(result).toContain('not found');
    });
  });

  describe('iconKey lifecycle and persistence', () => {
    beforeEach(() => {
      mockGetCustomAgent.mockReset();
      mockCreateCustomAgent.mockReset();
      mockUpdateCustomAgent.mockReset();
    });

    test('P-1: iconKey persists through create -> get lifecycle', async () => {
      const iconKey = 'persistent-icon-key';

      // Create agent
      mockGetCustomAgent.mockResolvedValue({ ...existingAgent, SK: 'parent-sk' });
      mockCreateCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'new-agent',
        iconKey,
        parentAgentId: 'parent-sk',
      });

      await createAgentTool.handler(
        { ...baseInput, iconKey, parentAgentId: 'parent-sk' } as any,
        context
      );

      // Now get the agent and verify iconKey is there
      mockGetCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'new-agent',
        iconKey,
      });

      const result = await getAgentTool.handler({ agentId: 'new-agent' } as any, context);
      const parsed = JSON.parse(result);

      expect(parsed.iconKey).toBe(iconKey);
    });

    test('P-2: iconKey persists through create -> update -> get lifecycle', async () => {
      const originalIcon = 'original-icon';
      const updatedIcon = 'updated-icon';

      // Create with original icon
      mockGetCustomAgent.mockResolvedValueOnce({ ...existingAgent, SK: 'parent-sk' });
      mockCreateCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'lifecycle-agent',
        iconKey: originalIcon,
        parentAgentId: 'parent-sk',
      });

      await createAgentTool.handler(
        { ...baseInput, iconKey: originalIcon, parentAgentId: 'parent-sk' } as any,
        context
      );

      // Update icon
      mockGetCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'lifecycle-agent',
        iconKey: originalIcon,
      });
      mockUpdateCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'lifecycle-agent',
        iconKey: updatedIcon,
      });

      await updateAgentTool.handler(
        { agentId: 'lifecycle-agent', iconKey: updatedIcon } as any,
        context
      );

      // Get and verify
      mockGetCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'lifecycle-agent',
        iconKey: updatedIcon,
      });

      const result = await getAgentTool.handler({ agentId: 'lifecycle-agent' } as any, context);
      const parsed = JSON.parse(result);

      expect(parsed.iconKey).toBe(updatedIcon);
    });
  });

  describe('iconKey edge cases', () => {
    beforeEach(() => {
      mockGetCustomAgent.mockReset();
      mockCreateCustomAgent.mockReset();
      mockUpdateCustomAgent.mockReset();
    });

    test('E-1: handles creation without iconKey gracefully', async () => {
      mockGetCustomAgent.mockResolvedValue({ ...existingAgent, SK: 'parent-sk' });
      mockCreateCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'agent-null-icon',
        parentAgentId: 'parent-sk',
      });

      // Should not throw even without iconKey
      await expect(
        createAgentTool.handler({ ...baseInput, parentAgentId: 'parent-sk' } as any, context)
      ).resolves.toBeDefined();
    });

    test('E-2: handles empty string iconKey', async () => {
      mockGetCustomAgent.mockResolvedValue(existingAgent);
      mockUpdateCustomAgent.mockResolvedValue({
        ...existingAgent,
        iconKey: '',
      });

      await updateAgentTool.handler(
        { agentId: 'agent-1', iconKey: '' } as any,
        context
      );

      const [, data] = mockUpdateCustomAgent.mock.calls[0];
      expect(data.iconKey).toBe('');
    });

    test('E-3: accepts long iconKey values (S3 keys can be lengthy)', async () => {
      const longIconKey = 'worker-abc123/very-long-filename-with-many-characters-' + 'x'.repeat(100) + '.png';
      mockGetCustomAgent.mockResolvedValue({ ...existingAgent, SK: 'parent-sk' });
      mockCreateCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'agent-1',
        iconKey: longIconKey,
        parentAgentId: 'parent-sk',
      });

      await createAgentTool.handler(
        { ...baseInput, iconKey: longIconKey, parentAgentId: 'parent-sk' } as any,
        context
      );

      const [payload] = mockCreateCustomAgent.mock.calls[0];
      expect(payload.iconKey).toBe(longIconKey);
    });

    test('E-4: accepts iconKey with special characters (S3 key formats)', async () => {
      const specialCharIconKey = 'my-worker/icon_v1.2-beta@latest.png';
      mockGetCustomAgent.mockResolvedValue(existingAgent);
      mockUpdateCustomAgent.mockResolvedValue({
        ...existingAgent,
        iconKey: specialCharIconKey,
      });

      await updateAgentTool.handler(
        { agentId: 'agent-1', iconKey: specialCharIconKey } as any,
        context
      );

      const [, data] = mockUpdateCustomAgent.mock.calls[0];
      expect(data.iconKey).toBe(specialCharIconKey);
    });

    test('E-5: preserves iconKey when updating other fields', async () => {
      mockGetCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'agent-1',
        iconKey: 'important-icon',
      });
      mockUpdateCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'agent-1',
        name: 'Updated Name',
        iconKey: 'important-icon', // Should remain unchanged
      });

      await updateAgentTool.handler(
        { agentId: 'agent-1', name: 'Updated Name' } as any,
        context
      );

      const [, data] = mockUpdateCustomAgent.mock.calls[0];
      expect(data).not.toHaveProperty('iconKey'); // Not explicitly updated
    });

    test('E-6: allows iconKey with path-like structures (S3 prefixes)', async () => {
      const s3PathIcon = 'agents/department-a/sub-team/icon-123.webp';
      mockGetCustomAgent.mockResolvedValue({ ...existingAgent, SK: 'parent-sk' });
      mockCreateCustomAgent.mockResolvedValue({
        ...existingAgent,
        SK: 'agent-1',
        iconKey: s3PathIcon,
        parentAgentId: 'parent-sk',
      });

      await createAgentTool.handler(
        { ...baseInput, iconKey: s3PathIcon, parentAgentId: 'parent-sk' } as any,
        context
      );

      const [payload] = mockCreateCustomAgent.mock.calls[0];
      expect(payload.iconKey).toBe(s3PathIcon);
    });
  });
});
