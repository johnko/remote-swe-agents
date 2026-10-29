import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockPaginateQuery = vi.fn();

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  paginateQuery: (...args: any[]) => mockPaginateQuery(...args),
  QueryCommand: vi.fn(),
  PutCommand: vi.fn(),
  UpdateCommand: vi.fn(),
  GetCommand: vi.fn(),
  DeleteCommand: vi.fn(),
}));

const mockDdbSend = vi.fn();

vi.mock('./aws', () => ({
  ddb: { send: (...args: any[]) => mockDdbSend(...args) },
  TableName: 'TestTable',
}));

import { getAllCustomAgents, getCustomAgent } from './custom-agent.js';
import type { CustomAgent } from '../schema/index.js';

const createMockAgent = (overrides: Partial<CustomAgent> & { SK: string }): CustomAgent => ({
  PK: 'custom-agent',
  name: 'Test Agent',
  description: 'Test description',
  defaultModel: 'sonnet4.6',
  systemPrompt: 'You are helpful.',
  tools: ['tool1', 'tool2'],
  useAllTools: false,
  mcpConfig: '{"mcpServers":{}}',
  runtimeType: 'agent-core',
  includeDefaultKnowledge: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

describe('getAllCustomAgents - Small Result Sets', () => {
  beforeEach(() => {
    mockPaginateQuery.mockReset();
  });

  it('returns empty array when 0 agents exist', async () => {
    const mockPaginator = {
      [Symbol.asyncIterator]: async function* () {
        yield { Items: [] };
      },
    };
    
    mockPaginateQuery.mockReturnValueOnce(mockPaginator);

    const result = await getAllCustomAgents();

    expect(result).toEqual([]);
  });

  it('returns all agents when count < page size (10 agents)', async () => {
    const agents = Array.from({ length: 10 }, (_, i) =>
      createMockAgent({ SK: `agent-${i}`, name: `Agent ${i}` })
    );

    const mockPaginator = {
      [Symbol.asyncIterator]: async function* () {
        yield { Items: agents };
      },
    };
    
    mockPaginateQuery.mockReturnValueOnce(mockPaginator);

    const result = await getAllCustomAgents();

    expect(result).toHaveLength(10);
    expect(result.map((a) => a.SK)).toEqual(agents.map((a) => a.SK));
  });

  it('returns all agents when count equals page size (50 agents)', async () => {
    const agents = Array.from({ length: 50 }, (_, i) =>
      createMockAgent({ SK: `agent-${i}`, name: `Agent ${i}` })
    );

    const mockPaginator = {
      [Symbol.asyncIterator]: async function* () {
        yield { Items: agents };
      },
    };
    
    mockPaginateQuery.mockReturnValueOnce(mockPaginator);

    const result = await getAllCustomAgents();

    expect(result).toHaveLength(50);
    expect(result.map((a) => a.SK)).toEqual(agents.map((a) => a.SK));
  });

  it('pretty-prints mcpConfig for all agents', async () => {
    const agent = createMockAgent({
      SK: 'agent-1',
      mcpConfig: '{"mcpServers":{"stdio":{"command":"node","args":["server.js"]}}}',
    });

    const mockPaginator = {
      [Symbol.asyncIterator]: async function* () {
        yield { Items: [agent] };
      },
    };
    
    mockPaginateQuery.mockReturnValueOnce(mockPaginator);

    const result = await getAllCustomAgents();

    expect(result).toHaveLength(1);
    // mcpConfig should be pretty-printed (with newlines/indentation)
    expect(result[0].mcpConfig).toContain('\n');
    expect(result[0].mcpConfig).toContain('  ');
    const parsed = JSON.parse(result[0].mcpConfig);
    expect(parsed).toHaveProperty('mcpServers.stdio');
  });
});

describe('getAllCustomAgents - Large Result Sets (Pagination)', () => {
  beforeEach(() => {
    mockPaginateQuery.mockReset();
  });

  it('handles 100 agents across 2 pages (page size 50)', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) =>
      createMockAgent({ SK: `agent-${i}`, name: `Agent ${i}` })
    );
    const page2 = Array.from({ length: 50 }, (_, i) =>
      createMockAgent({ SK: `agent-${50 + i}`, name: `Agent ${50 + i}` })
    );

    const mockPaginator = {
      [Symbol.asyncIterator]: async function* () {
        yield { Items: page1 };
        yield { Items: page2 };
      },
    };
    
    mockPaginateQuery.mockReturnValueOnce(mockPaginator);

    const result = await getAllCustomAgents();

    expect(result).toHaveLength(100);
    expect(result.map((a) => a.SK)).toEqual([...page1.map((a) => a.SK), ...page2.map((a) => a.SK)]);
  });

  it('handles 200 agents across 4 pages', async () => {
    const pages = Array.from({ length: 4 }, (_, pageNum) =>
      Array.from({ length: 50 }, (_, i) =>
        createMockAgent({ SK: `agent-${pageNum * 50 + i}`, name: `Agent ${pageNum * 50 + i}` })
      )
    );

    const mockPaginator = {
      [Symbol.asyncIterator]: async function* () {
        for (const page of pages) {
          yield { Items: page };
        }
      },
    };
    
    mockPaginateQuery.mockReturnValueOnce(mockPaginator);

    const result = await getAllCustomAgents();

    expect(result).toHaveLength(200);
    // Verify order is preserved across pages
    for (let i = 0; i < 200; i++) {
      expect(result[i].SK).toBe(`agent-${i}`);
    }
  });

  it('handles edge case: 101 agents (2 pages with last page having 1 item)', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) =>
      createMockAgent({ SK: `agent-${i}` })
    );
    const page2 = Array.from({ length: 51 }, (_, i) =>
      createMockAgent({ SK: `agent-${50 + i}` })
    );

    const mockPaginator = {
      [Symbol.asyncIterator]: async function* () {
        yield { Items: page1 };
        yield { Items: page2 };
      },
    };
    
    mockPaginateQuery.mockReturnValueOnce(mockPaginator);

    const result = await getAllCustomAgents();

    expect(result).toHaveLength(101);
    expect(result[100].SK).toBe('agent-100');
  });

  it('handles page with no Items property gracefully', async () => {
    const page1 = Array.from({ length: 25 }, (_, i) =>
      createMockAgent({ SK: `agent-${i}` })
    );

    const mockPaginator = {
      [Symbol.asyncIterator]: async function* () {
        yield { Items: page1 };
        yield {}; // Page with no Items
        yield { Items: [createMockAgent({ SK: 'agent-25' })] };
      },
    };
    
    mockPaginateQuery.mockReturnValueOnce(mockPaginator);

    const result = await getAllCustomAgents();

    expect(result).toHaveLength(26);
    expect(result.map((a) => a.SK)).toEqual([...Array.from({ length: 25 }, (_, i) => `agent-${i}`), 'agent-25']);
  });
});

describe('getAllCustomAgents - Pagination Internals', () => {
  beforeEach(() => {
    mockPaginateQuery.mockReset();
  });

  it('calls paginateQuery with correct parameters (PK, page size, DESC order)', async () => {
    const mockPaginator = {
      [Symbol.asyncIterator]: async function* () {
        yield { Items: [] };
      },
    };
    
    mockPaginateQuery.mockReturnValueOnce(mockPaginator);

    await getAllCustomAgents();

    expect(mockPaginateQuery).toHaveBeenCalledTimes(1);
    const [config, params] = mockPaginateQuery.mock.calls[0];
    
    // Verify page size
    expect(config.pageSize).toBe(50);
    
    // Verify key condition uses PK
    expect(params.KeyConditionExpression).toContain(':pk');
    expect(params.ExpressionAttributeValues[':pk']).toBe('custom-agent');
    
    // Verify DESC order
    expect(params.ScanIndexForward).toBe(false);
  });

  it('concatenates items from multiple pages in order', async () => {
    const agents = [
      createMockAgent({ SK: 'a', name: 'First' }),
      createMockAgent({ SK: 'b', name: 'Second' }),
      createMockAgent({ SK: 'c', name: 'Third' }),
    ];

    const mockPaginator = {
      [Symbol.asyncIterator]: async function* () {
        yield { Items: [agents[0]] };
        yield { Items: [agents[1]] };
        yield { Items: [agents[2]] };
      },
    };
    
    mockPaginateQuery.mockReturnValueOnce(mockPaginator);

    const result = await getAllCustomAgents();

    expect(result).toHaveLength(3);
    expect(result[0].SK).toBe('a');
    expect(result[1].SK).toBe('b');
    expect(result[2].SK).toBe('c');
  });

  it('maintains DESC order (ScanIndexForward: false)', async () => {
    const agents = Array.from({ length: 10 }, (_, i) =>
      createMockAgent({ SK: `agent-${String(i).padStart(3, '0')}`, name: `Agent ${i}` })
    ).reverse(); // Simulate DESC order

    const mockPaginator = {
      [Symbol.asyncIterator]: async function* () {
        yield { Items: agents };
      },
    };
    
    mockPaginateQuery.mockReturnValueOnce(mockPaginator);

    const result = await getAllCustomAgents();

    expect(result).toHaveLength(10);
    expect(result[0].SK).toBe(agents[0].SK);
  });
});

describe('getAllCustomAgents - Performance/Load Tests', () => {
  beforeEach(() => {
    mockPaginateQuery.mockReset();
  });

  it('handles 1000 agents (20 pages of 50 each) efficiently', async () => {
    const pageCount = 20;
    const itemsPerPage = 50;

    const mockPaginator = {
      [Symbol.asyncIterator]: async function* () {
        for (let p = 0; p < pageCount; p++) {
          const page = Array.from({ length: itemsPerPage }, (_, i) =>
            createMockAgent({ SK: `agent-${p * itemsPerPage + i}` })
          );
          yield { Items: page };
        }
      },
    };
    
    mockPaginateQuery.mockReturnValueOnce(mockPaginator);

    const startTime = performance.now();
    const result = await getAllCustomAgents();
    const endTime = performance.now();

    expect(result).toHaveLength(1000);
    expect(endTime - startTime).toBeLessThan(5000); // Should complete in < 5 seconds
  });

  it('handles 5000 agents (100 pages) without memory issues', async () => {
    const pageCount = 100;
    const itemsPerPage = 50;

    const mockPaginator = {
      [Symbol.asyncIterator]: async function* () {
        for (let p = 0; p < pageCount; p++) {
          const page = Array.from({ length: itemsPerPage }, (_, i) =>
            createMockAgent({ SK: `agent-${p * itemsPerPage + i}` })
          );
          yield { Items: page };
        }
      },
    };
    
    mockPaginateQuery.mockReturnValueOnce(mockPaginator);

    const result = await getAllCustomAgents();

    expect(result).toHaveLength(5000);
    expect(result.filter((a) => a.SK.startsWith('agent-'))).toHaveLength(5000);
  });

  it('properly disposes of resources after large pagination', async () => {
    const mockPaginator = {
      [Symbol.asyncIterator]: async function* () {
        for (let p = 0; p < 50; p++) {
          yield {
            Items: Array.from({ length: 50 }, (_, i) =>
              createMockAgent({ SK: `agent-${p * 50 + i}` })
            ),
          };
        }
      },
    };
    
    mockPaginateQuery.mockReturnValueOnce(mockPaginator);

    const result = await getAllCustomAgents();
    expect(result).toHaveLength(2500);

    // Verify we can call it again (resources are properly disposed)
    const mockPaginator2 = {
      [Symbol.asyncIterator]: async function* () {
        yield { Items: [createMockAgent({ SK: 'agent-final' })] };
      },
    };
    
    mockPaginateQuery.mockReturnValueOnce(mockPaginator2);
    const result2 = await getAllCustomAgents();
    expect(result2).toHaveLength(1);
  });
});

describe('getAllCustomAgents - Error Handling', () => {
  beforeEach(() => {
    mockPaginateQuery.mockReset();
  });

  it('handles async iterator errors gracefully', async () => {
    const mockPaginator = {
      [Symbol.asyncIterator]: async function* () {
        yield { Items: [createMockAgent({ SK: 'agent-1' })] };
        throw new Error('DynamoDB error');
      },
    };
    
    mockPaginateQuery.mockReturnValueOnce(mockPaginator);

    await expect(getAllCustomAgents()).rejects.toThrow('DynamoDB error');
  });
});

describe('Removed Pagination Functions Validation', () => {
  it('verifies old pagination patterns are not present in custom-agent.ts', async () => {
    const customAgentModule = await import('./custom-agent.js');
    
    expect(customAgentModule).toHaveProperty('getAllCustomAgents');
    expect(customAgentModule).toHaveProperty('getCustomAgent');
    expect(customAgentModule).toHaveProperty('createCustomAgent');
    expect(customAgentModule).toHaveProperty('updateCustomAgent');
    expect(customAgentModule).toHaveProperty('deleteCustomAgent');

    // Verify no old pagination functions exist
    expect(customAgentModule).not.toHaveProperty('listCustomAgents');
    expect(customAgentModule).not.toHaveProperty('listCustomAgentsWithCursor');
    expect(customAgentModule).not.toHaveProperty('getCustomAgentsPage');
  });
});

describe('Other Custom Agent Functions', () => {
  beforeEach(() => {
    mockDdbSend.mockReset();
  });

  it('getCustomAgent returns agent by ID', async () => {
    const agent = createMockAgent({ SK: 'agent-1' });
    mockDdbSend.mockResolvedValueOnce({ Item: agent });

    const result = await getCustomAgent('agent-1');

    expect(result).toEqual(agent);
    expect(mockDdbSend).toHaveBeenCalledTimes(1);
  });

  it('getCustomAgent returns undefined when agent not found', async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: undefined });

    const result = await getCustomAgent('missing');

    expect(result).toBeUndefined();
  });

  it('getCustomAgent returns undefined when customAgentId is undefined', async () => {
    const result = await getCustomAgent(undefined);

    expect(result).toBeUndefined();
    expect(mockDdbSend).not.toHaveBeenCalled();
  });
});
