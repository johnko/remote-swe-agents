'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRightIcon, Loader2Icon } from 'lucide-react';
import type { CustomAgent } from '@remote-swe-agents/agent-core/schema';
import AgentIconPreview from './AgentIconPreview';
import AgentBadges from './AgentBadges';
import DuplicateAgentButton from './DuplicateAgentButton';
import LocalDateTime from '@/components/LocalDateTime';
import { getCustomAgentsPageAction } from '../actions';
import { useTranslations } from 'next-intl';

type CustomAgentListProps = {
  agents: CustomAgent[];
  subAgentCounts: Record<string, number>;
  initialLastEvaluatedKey?: Record<string, any>;
};

export default function CustomAgentList({
  agents: initialAgents,
  subAgentCounts,
  initialLastEvaluatedKey,
}: CustomAgentListProps) {
  const t = useTranslations('customAgent');
  const [agents, setAgents] = useState<CustomAgent[]>(initialAgents);
  const [lastEvaluatedKey, setLastEvaluatedKey] = useState(initialLastEvaluatedKey);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [subAgentCountsState, setSubAgentCountsState] = useState(subAgentCounts);

  const handleLoadMore = async () => {
    setIsLoading(true);
    try {
      const result = await getCustomAgentsPageAction({ lastEvaluatedKey, limit: 50 });
      if (result.data?.success) {
        const newAgents = result.data.agents;
        setAgents((prev) => [...prev, ...newAgents]);
        setLastEvaluatedKey(result.data.lastEvaluatedKey);
        setTotal(result.data.total ?? 0);

        // Update subAgentCounts for new agents
        const newCounts = { ...subAgentCountsState };
        newAgents.forEach((agent) => {
          if (!agent.parentAgentId) {
            const subAgentCount = newAgents.filter((a) => a.parentAgentId === agent.SK).length;
            if (subAgentCount > 0) {
              newCounts[agent.SK] = subAgentCount;
            }
          }
        });
        setSubAgentCountsState(newCounts);
      }
    } catch (error) {
      console.error('Error loading more agents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {agents.map((agent) => (
        <Link
          key={agent.SK}
          href={`/custom-agent/${encodeURIComponent(agent.SK)}`}
          className="block border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <div className="p-4">
            <div className="flex justify-between items-start mb-2 gap-2">
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                <AgentIconPreview iconKey={agent.iconKey} size={32} />
                <h3 className="text-lg font-semibold">{agent.name}</h3>
                <AgentBadges agent={agent} subAgentsCount={subAgentCountsState[agent.SK]} />
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  <LocalDateTime timestamp={agent.createdAt} format="date" />
                </span>
                <DuplicateAgentButton agentId={agent.SK} />
                <ChevronRightIcon className="h-4 w-4 text-gray-500" />
              </div>
            </div>
            <p className="text-gray-600 dark:text-gray-400">{agent.description}</p>
          </div>
        </Link>
      ))}

      {lastEvaluatedKey && (
        <button
          onClick={handleLoadMore}
          disabled={isLoading}
          className="w-full mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          {isLoading && <Loader2Icon className="h-4 w-4 animate-spin" />}
          {isLoading ? t('list.loading') : t('list.loadMore')}
        </button>
      )}
    </div>
  );
}
