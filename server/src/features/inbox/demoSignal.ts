type Waiter = { conversationId: string; finish: () => void };
const waiting = new Map<string, Waiter>();

export function signalDemoConversation(conversationId: string) {
  for (const waiter of waiting.values()) {
    if (waiter.conversationId === conversationId) waiter.finish();
  }
}

export function watchDemoConversation(identity: string, conversationId: string) {
  waiting.get(identity)?.finish();
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveUpdate!: () => void;
  const updated = new Promise<void>((resolve) => { resolveUpdate = resolve; });
  function finish() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (waiting.get(identity)?.finish === finish) waiting.delete(identity);
    resolveUpdate();
  }
  if (waiting.size >= 200) finish();
  else waiting.set(identity, { conversationId, finish });
  return {
    finish,
    wait(waitMs: number) {
      if (!done) timer = setTimeout(finish, Math.min(20000, waitMs));
      return updated;
    },
  };
}
