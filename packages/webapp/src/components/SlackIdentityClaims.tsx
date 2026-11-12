'use client';

import React, { useState, useCallback } from 'react';
import { Check, X, HelpCircle, Clock, Shield, RefreshCw, CheckCircle2, XCircle, AlertCircle, MessageSquare } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAction } from 'next-safe-action/hooks';
import { toast } from 'sonner';
import {
  SlackIdentityClaim,
  SlackIdentityClaimStatus,
} from '@remote-swe-agents/agent-core/schema';
import { formatDateTime } from '@/lib/utils';

interface SlackIdentityClaimsProps {
  sessionId: string;
  claims: SlackIdentityClaim[];
  onClaimsUpdated: () => void;
  locale?: string;
}

// Import the action types
import { approveSlackIdentityClaim, rejectSlackIdentityClaim } from '@/app/sessions/[workerId]/actions';

interface ClaimCardProps {
  claim: SlackIdentityClaim;
  onApprove: (claim: SlackIdentityClaim) => Promise<void>;
  onReject: (claim: SlackIdentityClaim) => Promise<void>;
  isPending: boolean;
  locale: string;
}

function StatusBadge({ status }: { status: SlackIdentityClaimStatus }) {
  const statusConfig = {
    pending: { icon: Clock, className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', label: 'Pending' },
    approved: { icon: CheckCircle2, className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', label: 'Approved' },
    rejected: { icon: XCircle, className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', label: 'Rejected' },
    expired: { icon: AlertCircle, className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200', label: 'Expired' },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.className}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function ClaimCard({ claim, onApprove, onReject, isPending, locale }: ClaimCardProps) {
  const isActionable = claim.status === 'pending' && claim.expiresAt > Date.now();
  const timeRemaining = claim.expiresAt - Date.now();
  const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
  const createdAt = new Date(claim.createdAt);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-purple-600" />
            <CardTitle className="text-base">Slack Identity Claim</CardTitle>
          </div>
          <StatusBadge status={claim.status} />
        </div>
        <CardDescription className="text-sm">
          A Slack user is claiming to be you in session <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{claim.sessionId}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pb-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium min-w-[100px]">Slack User:</span>
            <span className="font-mono text-gray-600 dark:text-gray-400">{claim.slackUserId}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium min-w-[100px]">Channel:</span>
            <span className="text-gray-600 dark:text-gray-400">{claim.evidence.slackChannelId}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium min-w-[100px]">Created:</span>
            <span className="text-gray-600 dark:text-gray-400">{formatDateTime(createdAt, locale)}</span>
          </div>
        </div>

        {isActionable && (
          <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            {hoursRemaining > 0 ? (
              <span>Expires in {hoursRemaining}h {minutesRemaining}m</span>
            ) : (
              <span>Expires in {minutesRemaining}m</span>
            )}
          </div>
        )}

        {claim.status === 'approved' && claim.cognitoUserId && (
          <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <Check className="w-3 h-3" />
            <span>Linked to Cognito user</span>
          </div>
        )}
      </CardContent>

      {isActionable && (
        <CardFooter className="flex gap-2 pt-0">
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => onApprove(claim)}
            disabled={isPending}
          >
            {isPending ? (
              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-1" />
            )}
            Yes, it's me
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onReject(claim)}
            disabled={isPending}
          >
            {isPending ? (
              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <HelpCircle className="w-4 h-4 mr-1" />
            )}
            Can't tell
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="flex-1"
            onClick={() => onReject(claim)}
            disabled={isPending}
          >
            {isPending ? (
              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <X className="w-4 h-4 mr-1" />
            )}
            Not me
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export default function SlackIdentityClaims({
  sessionId,
  claims,
  onClaimsUpdated,
  locale = 'en-US',
}: SlackIdentityClaimsProps) {
  const [optimisticClaims, setOptimisticClaims] = useState<SlackIdentityClaim[]>(claims);

  // Keep optimistic claims in sync with prop
  React.useEffect(() => {
    setOptimisticClaims(claims);
  }, [claims]);

  const { execute: executeApprove, status: approveStatus } = useAction(approveSlackIdentityClaim, {
    onSuccess: (data) => {
      if (data?.data?.success) {
        toast.success('Identity claim approved successfully');
        onClaimsUpdated();
      } else if (data?.data?.error) {
        toast.error(data.data.error);
      }
    },
    onError: (error) => {
      const serverError = error?.error?.serverError;
      toast.error(typeof serverError === 'string' ? serverError : 'Failed to approve claim');
    },
  });

  const { execute: executeReject, status: rejectStatus } = useAction(rejectSlackIdentityClaim, {
    onSuccess: (data) => {
      if (data?.data?.success) {
        toast.success('Identity claim rejected');
        onClaimsUpdated();
      } else if (data?.data?.error) {
        toast.error(data.data.error);
      }
    },
    onError: (error) => {
      const serverError = error?.error?.serverError;
      toast.error(typeof serverError === 'string' ? serverError : 'Failed to reject claim');
    },
  });

  const handleApprove = useCallback(
    async (claim: SlackIdentityClaim) => {
      // Optimistic update
      setOptimisticClaims((prev) =>
        prev.map((c) =>
          c.slackUserId === claim.slackUserId ? { ...c, status: 'approved' as const } : c
        )
      );
      executeApprove({ slackUserId: claim.slackUserId, sessionId: claim.sessionId });
    },
    [executeApprove]
  );

  const handleReject = useCallback(
    async (claim: SlackIdentityClaim) => {
      // Optimistic update
      setOptimisticClaims((prev) =>
        prev.map((c) =>
          c.slackUserId === claim.slackUserId ? { ...c, status: 'rejected' as const } : c
        )
      );
      executeReject({ slackUserId: claim.slackUserId, sessionId: claim.sessionId });
    },
    [executeReject]
  );

  const pendingClaims = optimisticClaims.filter((c) => c.status === 'pending');
  const resolvedClaims = optimisticClaims.filter((c) => c.status !== 'pending');

  if (optimisticClaims.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {pendingClaims.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-500" />
            Pending Identity Claims ({pendingClaims.length})
          </h3>
          {pendingClaims.map((claim) => (
            <ClaimCard
              key={claim.slackUserId}
              claim={claim}
              onApprove={handleApprove}
              onReject={handleReject}
              isPending={approveStatus === 'executing' || rejectStatus === 'executing'}
              locale={locale}
            />
          ))}
        </div>
      )}

      {resolvedClaims.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-gray-500" />
            Resolved Claims ({resolvedClaims.length})
          </h3>
          {resolvedClaims.map((claim) => (
            <ClaimCard
              key={claim.slackUserId}
              claim={claim}
              onApprove={handleApprove}
              onReject={handleReject}
              isPending={false}
              locale={locale}
            />
          ))}
        </div>
      )}
    </div>
  );
}
