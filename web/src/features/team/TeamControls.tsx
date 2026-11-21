import { useEffect, useEffectEvent, useState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { AssignmentResult, ConversationTeamState } from '@nless/shared/features/team/types';
import { ConfirmDialog, SectionCard, StatusChip, useApiMutation, useApiQuery, useRealtime, useSession, useToast } from '../../core';

interface TakeoverInput {
  expectedVersion: number;
  force?: boolean;
}

interface Conflict {
  name: string;
  version: number;
}

interface TeamControlsProps {
  conversationId: string;
  compact?: boolean;
}

export function TeamControls(props: TeamControlsProps) {
  const { currentBusiness, user } = useSession();
  if (!currentBusiness || !user) return null;
  return <ScopedTeamControls key={[user.id, currentBusiness.id, props.conversationId].join(':')}
    {...props} businessId={currentBusiness.id} userId={user.id} />;
}

function ScopedTeamControls({ conversationId, compact = false, businessId, userId }:
  TeamControlsProps & { businessId: string; userId: string }) {
  const { t } = useTranslation('team');
  const toast = useToast();
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [lastState, setLastState] = useState<ConversationTeamState>();
  const endpoint = (action: string) => '/conversations/' + encodeURIComponent(conversationId) + '/' + action +
    '?businessId=' + encodeURIComponent(businessId);
  const { data, loading, error, reload } = useApiQuery<ConversationTeamState>(endpoint('team'), { businessScoped: false });
  const takeover = useApiMutation<TakeoverInput, AssignmentResult>('POST', endpoint('takeover'), { businessScoped: false, toastOnError: false });
  const release = useApiMutation<Record<string, never>, AssignmentResult>('POST', endpoint('release'), { businessScoped: false });
  const pending = takeover.running || release.running;

  useEffect(() => {
    if (error) setLastState(undefined);
    else if (data?.conversationId === conversationId) setLastState(data);
  }, [conversationId, data, error]);

  const refreshVisible = useEffectEvent(() => {
    if (!loading && !pending && document.visibilityState === 'visible') reload();
  });
  useEffect(() => {
    // A reconnected socket gets future events only. Reconcile even if the tab never lost focus.
    const timer = window.setInterval(refreshVisible, 15000);
    document.addEventListener('visibilitychange', refreshVisible);
    window.addEventListener('focus', refreshVisible);
    window.addEventListener('online', refreshVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshVisible);
      window.removeEventListener('focus', refreshVisible);
      window.removeEventListener('online', refreshVisible);
    };
  }, []);

  useRealtime('conversation.updated', (event) => {
    if (event.conversationId === conversationId) reload();
  });

  async function takeOver(input: TakeoverInput) {
    try {
      await takeover.run(input);
      toast.success(t('toast.takenOver'));
      reload();
      return true;
    } catch (cause) {
      const failure = cause as { code?: string; details?: { holder?: { displayName?: string; userId?: string }; currentVersion?: number } };
      if (failure.code === 'VERSION_CONFLICT') {
        const { holder, currentVersion } = failure.details ?? {};
        if (typeof holder?.displayName === 'string' && holder.userId !== userId && typeof currentVersion === 'number') {
          setConflict({ name: holder.displayName, version: currentVersion });
        } else {
          setConflict(null);
          toast.info(t('toast.stale'));
        }
      } else {
        toast.error(cause);
      }
      reload();
      return false;
    }
  }

  async function handBack() {
    try {
      await release.run({});
      toast.success(t('toast.released'));
    } finally {
      reload();
    }
  }

  const latest = data ?? lastState;
  const state = latest?.conversationId === conversationId ? latest : undefined;
  const holder = state?.assigneeUserId && state.assigneeName !== null
    ? { self: state.assigneeUserId === userId, name: state.assigneeName }
    : null;
  const contents = (
    <Stack spacing={1} sx={{ width: '100%' }}>
      {error ? (
        <Alert severity="error" action={<Button color="inherit" onClick={reload}>{t('common:actions.retry')}</Button>}>
          {t('panel.unavailable')}
        </Alert>
      ) : !state ? (
        <Typography role="status" variant="body2" color="text.secondary">{t('panel.loading')}</Typography>
      ) : (
        <>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
            <Box component="span" data-testid="team-handler-chip" data-handler={state.handler}>
              <StatusChip kind="conversation" status={state.handler} label={t(state.handler === 'ai' ? 'panel.handlerAi' : 'panel.handlerHuman')} />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {state.status === 'closed' ? t('panel.closed') : state.isQueued ? t('panel.queued') : holder && t('panel.heldBy', { name: holder.name })}
            </Typography>
          </Stack>
          {state.canTakeover && (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
              {!holder?.self && (
                <Button
                  data-testid="team-takeover"
                  variant="contained"
                  disabled={pending || loading}
                  sx={{ minHeight: 44 }}
                  onClick={() => {
                    if (holder) setConflict({ name: holder.name, version: state.version });
                    else void takeOver({ expectedVersion: state.version });
                  }}
                >
                  {holder ? t('actions.takeoverFrom', { name: holder.name }) : t('actions.takeover')}
                </Button>
              )}
              {state.handler === 'human' && (
                <Button data-testid="team-release" variant="outlined" disabled={pending || loading} sx={{ minHeight: 44 }}
                  onClick={() => void handBack().catch(() => {})}>
                  {t('actions.release')}
                </Button>
              )}
            </Stack>
          )}
          {state.status === 'open' && state.handler === 'ai' && (
            <Typography variant="body2" color="text.secondary">{t('panel.waitingForNext')}</Typography>
          )}
        </>
      )}
      <ConfirmDialog
        open={conflict !== null}
        title={t('conflict.title')}
        message={t('conflict.message', { name: conflict?.name ?? '' })}
        confirmLabel={t('actions.takeover')}
        onClose={() => setConflict(null)}
        onConfirm={async () => {
          if (conflict && !await takeOver({ expectedVersion: conflict.version, force: true })) {
            throw new Error('Takeover failed');
          }
        }}
      />
    </Stack>
  );
  return compact ? contents : <SectionCard title={t('panel.title')}>{contents}</SectionCard>;
}
