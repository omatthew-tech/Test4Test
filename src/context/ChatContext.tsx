import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAppState } from "./AppStateContext";
import { chatApi, type ChatApi, type ChatInbox } from "../lib/chat";
import { createChatFixture } from "../testing/chatFixture";

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1";
const ChatUnreadContext = createContext(0);
const ChatContext = createContext<{
  api: ChatApi;
  inbox: ChatInbox;
  loading: boolean;
  error: string;
  connected: boolean;
  revision: number;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
} | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { state, currentUser } = useAppState();
  const userId = currentUser?.id;
  return (
    <ChatSession key={userId ?? "guest"} userId={userId} fixtureState={state}>
      {children}
    </ChatSession>
  );
}

function ChatSession({
  children,
  userId,
  fixtureState,
}: {
  children: ReactNode;
  userId?: string;
  fixtureState: ReturnType<typeof useAppState>["state"];
}) {
  const [api] = useState(() => (fixtureMode && userId ? createChatFixture(fixtureState) : chatApi));
  const [inbox, setInbox] = useState<ChatInbox>({ items: [], nextBefore: null, unreadCount: 0 });
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [revision, setRevision] = useState(0);
  const alive = useRef(true);
  const request = useRef(0);
  const refreshing = useRef<Promise<void> | null>(null);
  const refreshPending = useRef(false);
  const refresh = useCallback((): Promise<void> => {
    if (!userId || !alive.current) return Promise.resolve();
    request.current++;
    refreshPending.current = true;
    if (refreshing.current) return refreshing.current;
    // A burst of realtime, focus, or reconnect events needs at most one follow-up
    // read. Never discard an invalidation that arrives during the current request.
    const pending = (async () => {
      while (alive.current && refreshPending.current) {
        refreshPending.current = false;
        const ticket = request.current;
        try {
          const result = await api.list();
          if (alive.current && ticket === request.current) {
            setInbox(result);
            setError("");
          }
        } catch (failure) {
          if (alive.current && ticket === request.current)
            setError(failure instanceof Error ? failure.message : "Messages could not be loaded.");
        } finally {
          if (alive.current && ticket === request.current) setLoading(false);
        }
      }
    })().finally(() => {
      refreshing.current = null;
      if (alive.current && refreshPending.current) return refresh();
    });
    refreshing.current = pending;
    return pending;
  }, [api, userId]);
  const loadMore = useCallback(async () => {
    if (!inbox.nextBefore) return;
    const ticket = request.current;
    try {
      const result = await api.list(inbox.nextBefore);
      if (alive.current && ticket === request.current)
        setInbox((previous) => ({
          ...result,
          items: [
            ...new Map(
              [...previous.items, ...result.items].map((entry) => [entry.id, entry]),
            ).values(),
          ],
        }));
    } catch {
      if (alive.current) setError("More conversations could not be loaded. Try again.");
    }
  }, [api, inbox.nextBefore]);
  useEffect(() => {
    alive.current = true;
    if (!userId) return;
    const changed = () => {
      if (alive.current) {
        setRevision((value) => value + 1);
        void refresh();
      }
    };
    void refresh();
    let unsubscribe = () => {};
    try {
      unsubscribe = api.subscribe(userId, changed, (value) => {
        if (alive.current) setConnected(value);
      });
    } catch {
      setConnected(false);
    }
    const visible = () => {
      if (document.visibilityState === "visible") changed();
    };
    window.addEventListener("focus", visible);
    window.addEventListener("online", changed);
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive.current = false;
      refreshPending.current = false;
      request.current++;
      unsubscribe();
      window.removeEventListener("focus", visible);
      window.removeEventListener("online", changed);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [api, refresh, userId]);
  useEffect(() => {
    if (!userId || connected) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setRevision((value) => value + 1);
        void refresh();
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [connected, refresh, userId]);
  const value = useMemo(
    () => ({ api, inbox, loading, error, connected, revision, refresh, loadMore }),
    [api, inbox, loading, error, connected, revision, refresh, loadMore],
  );
  return (
    <ChatContext.Provider value={value}>
      <ChatUnreadContext.Provider value={inbox.unreadCount}>{children}</ChatUnreadContext.Provider>
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChat must be used within ChatProvider");
  return context;
}

// Layout is also rendered independently in existing stories/tests.
export function useChatUnreadCount() {
  return useContext(ChatUnreadContext);
}
