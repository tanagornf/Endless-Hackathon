type Waiter = { conversationId: string; finish: () => void };

const waiting = new Map<string, Waiter>();

export function signalDemoConversation(conversationId: string) {
  for (const waiter of waiting.values()) {
    if (waiter.conversationId === conversationId) waiter.finish();
  }
}

export function waitForDemoUpdate(identity: string, conversationId: string, waitMs: number): Promise<void> {
  waiting.get(identity)?.finish();
  if (waiting.size >= 200) return Promise.resolve();
  return new Promise((resolve) => {
    const limit = Math.min(20000, waitMs);
    const finish = () => {
      clearTimeout(timer);
      if (waiting.get(identity)?.finish === finish) waiting.delete(identity);
      resolve();
    };
    const timer = setTimeout(finish, limit);
    waiting.set(identity, { conversationId, finish });
  });
}
