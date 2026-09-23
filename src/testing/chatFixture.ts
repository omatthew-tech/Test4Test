import type { AppState } from "../types";
import type { ChatApi, ChatConversation, ChatMessage, ChatTarget } from "../lib/chat";

interface FixtureConversation {
  id: string;
  submissionId: string;
  founderId: string;
  testerId: string;
  productName: string;
  names: Record<string, string>;
  messages: ChatMessage[];
  read: Record<string, number>;
  requests: Record<string, string>;
}
const storageKey = "test4test-chat-fixture-v1";
const eventName = "test4test-chat-fixture-change";

export function createChatFixture(state: AppState): ChatApi {
  const actor = state.currentUserId!;
  const load = (): FixtureConversation[] => JSON.parse(localStorage.getItem(storageKey) ?? "[]");
  const save = (items: FixtureConversation[]) => {
    localStorage.setItem(storageKey, JSON.stringify(items));
    window.dispatchEvent(new Event(eventName));
  };
  const summary = (item: FixtureConversation): ChatConversation => ({
    id: item.id,
    submissionId: item.submissionId,
    productName: item.productName,
    peerName: item.names[item.founderId === actor ? item.testerId : item.founderId],
    canSend: true,
    lastSequence: item.messages[item.messages.length - 1]?.sequence ?? 0,
    lastMessage: item.messages[item.messages.length - 1]?.body ?? null,
    lastMessageAt: item.messages[item.messages.length - 1]?.createdAt ?? null,
    unreadCount: item.messages.filter(
      (message) => message.senderUserId !== actor && message.sequence > (item.read[actor] ?? 0),
    ).length,
  });
  const resolve = (target: ChatTarget, items: FixtureConversation[]) => {
    if (target.conversationId) {
      const item = items.find(
        (entry) =>
          entry.id === target.conversationId && [entry.founderId, entry.testerId].includes(actor),
      );
      if (!item) throw new Error("This conversation is unavailable.");
      return item;
    }
    const response = state.responses.find((entry) => entry.id === target.responseId);
    const submission = state.submissions.find((entry) => entry.id === response?.submissionId);
    if (
      !response?.testerUserId ||
      !submission?.userId ||
      response.testerUserId === submission.userId ||
      ![submission.userId, response.testerUserId].includes(actor)
    )
      throw new Error("This conversation is unavailable.");
    return (
      items.find(
        (entry) => entry.submissionId === submission.id && entry.testerId === response.testerUserId,
      ) ?? {
        id: crypto.randomUUID(),
        submissionId: submission.id,
        founderId: submission.userId,
        testerId: response.testerUserId,
        productName: submission.productName,
        names: Object.fromEntries(state.users.map((user) => [user.id, user.displayName])),
        messages: [],
        read: {},
        requests: {},
      }
    );
  };
  // Isolated fixture data; never calls Supabase, email services or production storage.
  if (!load().some((entry) => [entry.founderId, entry.testerId].includes(actor))) {
    const app =
      state.submissions.find((entry) => entry.userId === actor) ??
      state.submissions.find((entry) => entry.userId !== actor);
    if (app?.userId) {
      const tester =
        app.userId === actor
          ? (state.responses.find(
              (response) =>
                response.submissionId === app.id &&
                response.testerUserId &&
                response.testerUserId !== actor,
            )?.testerUserId ?? state.users.find((user) => user.id !== actor)?.id)
          : actor;
      if (tester) {
        const id = `demo-${app.id}-${tester}`;
        const peer = actor === tester ? app.userId : tester;
        const items = load();
        items.push({
          id,
          submissionId: app.id,
          founderId: app.userId,
          testerId: tester,
          productName: app.productName,
          names: Object.fromEntries(state.users.map((user) => [user.id, user.displayName])),
          read: {},
          requests: {},
          messages: [
            {
              id: `${id}-welcome`,
              sequence: 1,
              conversationId: id,
              senderUserId: peer,
              body: "Thanks for taking a look. What did you think of the first screen?",
              createdAt: "2026-09-20T15:00:00Z",
            },
          ],
        });
        save(items);
      }
    }
  }
  return {
    async list(before) {
      const all = load()
        .filter((entry) => [entry.founderId, entry.testerId].includes(actor))
        .map(summary)
        .sort((a, b) => b.lastSequence - a.lastSequence);
      const items = all
        .filter((entry) => before === undefined || entry.lastSequence < before)
        .slice(0, 30);
      return {
        items,
        nextBefore: items.length === 30 ? items[29].lastSequence : null,
        unreadCount: all.reduce((sum, entry) => sum + entry.unreadCount, 0),
      };
    },
    async context(target) {
      const item = resolve(target, load());
      return { ...summary(item), id: item.messages.length ? item.id : null };
    },
    async history(id, before) {
      const all = resolve({ conversationId: id }, load()).messages.filter(
        (item) => before === undefined || item.sequence < before,
      );
      const items = all.slice(-50);
      return { items, nextBefore: all.length > 50 ? items[0].sequence : null };
    },
    async send(input) {
      if (!input.body.trim() || Array.from(input.body).length > 4000)
        throw new Error("Write a message between 1 and 4,000 characters.");
      const items = load();
      const item = resolve(input, items);
      const duplicate = item.requests[`${actor}:${input.requestId}`];
      if (duplicate) return { conversationId: item.id, messageId: duplicate };
      if (!items.includes(item)) items.push(item);
      const messageId = crypto.randomUUID();
      const sequence =
        Math.max(
          0,
          ...items.flatMap((entry) => entry.messages.map((message) => message.sequence)),
        ) + 1;
      item.messages.push({
        id: messageId,
        sequence,
        conversationId: item.id,
        senderUserId: actor,
        body: input.body,
        createdAt: new Date().toISOString(),
      });
      item.requests[`${actor}:${input.requestId}`] = messageId;
      save(items);
      return { conversationId: item.id, messageId };
    },
    async markRead(id, sequence) {
      const items = load();
      const item = resolve({ conversationId: id }, items);
      if ((item.read[actor] ?? 0) >= sequence) return;
      item.read[actor] = sequence;
      save(items);
    },
    subscribe(_user, changed, connection) {
      connection(true);
      window.addEventListener(eventName, changed);
      window.addEventListener("storage", changed);
      return () => {
        window.removeEventListener(eventName, changed);
        window.removeEventListener("storage", changed);
      };
    },
  };
}
