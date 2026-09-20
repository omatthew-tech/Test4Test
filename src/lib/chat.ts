import { requireSupabase } from "./supabase";

export interface ChatConversation {
  id: string | null;
  submissionId: string;
  productName: string;
  peerName: string;
  canSend: boolean;
  lastSequence: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}
export interface ChatMessage {
  id: string;
  sequence: number;
  conversationId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
}
export interface ChatPage<T> {
  items: T[];
  nextBefore: number | null;
}
export interface ChatInbox extends ChatPage<ChatConversation> {
  unreadCount: number;
}
export interface ChatTarget {
  conversationId?: string;
  responseId?: string;
}
export interface ChatSend extends ChatTarget {
  requestId: string;
  body: string;
}
export interface ChatApi {
  list(before?: number): Promise<ChatInbox>;
  context(target: ChatTarget): Promise<ChatConversation>;
  history(id: string, before?: number): Promise<ChatPage<ChatMessage>>;
  send(input: ChatSend): Promise<{ conversationId: string; messageId: string }>;
  markRead(id: string, sequence: number): Promise<void>;
  subscribe(
    userId: string,
    changed: () => void,
    connection: (connected: boolean) => void,
  ): () => void;
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, args);
  if (error) {
    // Only intentional database validation messages are suitable for the UI.
    throw new Error(
      ["42501", "22023", "P0001"].includes(error.code)
        ? error.message
        : "Messages could not be loaded or saved. Please try again.",
    );
  }
  return data as T;
}

export const chatApi: ChatApi = {
  list: (before) => rpc("chat_list", { p_before: before ?? null }),
  context: (target) =>
    rpc("chat_context", {
      p_conversation_id: target.conversationId ?? null,
      p_response_id: target.responseId ?? null,
    }),
  history: (id, before) => rpc("chat_history", { p_conversation_id: id, p_before: before ?? null }),
  send: (input) =>
    rpc("chat_send", {
      p_request_id: input.requestId,
      p_body: input.body,
      p_conversation_id: input.conversationId ?? null,
      p_response_id: input.responseId ?? null,
    }),
  markRead: (id, sequence) =>
    rpc("chat_mark_read", { p_conversation_id: id, p_sequence: sequence }),
  subscribe(userId, changed, connection) {
    const client = requireSupabase();
    const channel = client
      .channel(`chat:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_conversations" },
        changed,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        changed,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_read_states",
          filter: `user_id=eq.${userId}`,
        },
        changed,
      )
      .subscribe((status) => {
        connection(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") changed();
      });
    return () => {
      void client.removeChannel(channel);
    };
  },
};

export function mergeMessages(previous: ChatMessage[], incoming: ChatMessage[]) {
  return [
    ...new Map([...previous, ...incoming].map((message) => [message.id, message])).values(),
  ].sort((a, b) => a.sequence - b.sequence);
}
