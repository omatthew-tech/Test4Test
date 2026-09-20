import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  EmptyState,
  Link,
  Skeleton,
  Stack,
  Surface,
  Textarea,
} from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { useChat } from "../context/ChatContext";
import { useAccountState } from "../context/AppStateContext";
import { mergeMessages, type ChatConversation, type ChatMessage } from "../lib/chat";
import { formatDateTime } from "../lib/format";
import styles from "./MessagesPage.module.css";

export function MessagesPage() {
  const { conversationId } = useParams();
  const [search] = useSearchParams();
  const responseId = search.get("response") ?? undefined;
  const selected = Boolean(conversationId || responseId);
  const { inbox, loading, error, refresh, loadMore } = useChat();
  const fixtureSearch = new URLSearchParams();
  if (import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1") {
    for (const key of ["ds-user", "ds-tester"]) {
      const value = search.get(key);
      if (value) fixtureSearch.set(key, value);
    }
  }
  const suffix = fixtureSearch.size ? `?${fixtureSearch}` : "";
  return (
    <AppShell title="Messages">
      <div className={styles.layout} data-selected={selected}>
        <Surface className={styles.inbox}>
          <h2 className={styles.sectionTitle}>Conversations</h2>
          {error ? (
            <Alert tone="danger">
              {error}
              <Button variant="quiet" onClick={() => void refresh()}>
                Try again
              </Button>
            </Alert>
          ) : null}
          {loading ? (
            <div role="status" aria-label="Loading conversations">
              <Skeleton />
            </div>
          ) : null}
          {!loading && !error && !inbox.items.length ? (
            <p className={styles.muted}>Your conversations will appear here.</p>
          ) : null}
          <nav aria-label="Conversations">
            <ul className={styles.conversations}>
              {inbox.items.map((item) => (
                <li key={item.id}>
                  <Link
                    to={`/messages/${item.id}${suffix}`}
                    className={styles.conversation}
                    aria-current={item.id === conversationId ? "page" : undefined}
                  >
                    <span className={styles.row}>
                      <strong>{item.productName}</strong>
                      {item.unreadCount ? (
                        <span className={styles.unread}>{item.unreadCount} unread</span>
                      ) : null}
                    </span>
                    <span>{item.peerName}</span>
                    <span className={styles.preview}>{item.lastMessage}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {inbox.nextBefore ? (
            <Button variant="quiet" onClick={() => void loadMore()}>
              Load more conversations
            </Button>
          ) : null}
        </Surface>
        <Surface className={styles.thread}>
          {selected ? (
            <ChatThread
              key={conversationId ?? responseId}
              conversationId={conversationId}
              responseId={responseId}
              suffix={suffix}
            />
          ) : (
            <EmptyState
              title="Your conversations"
              description="Select a conversation to read and reply. To start one, open a tester’s recording and select Message."
            />
          )}
        </Surface>
      </div>
    </AppShell>
  );
}

function ChatThread({
  conversationId,
  responseId,
  suffix,
}: {
  conversationId?: string;
  responseId?: string;
  suffix: string;
}) {
  const { api, revision, connected, refresh } = useChat();
  const { currentUser } = useAccountState();
  const navigate = useNavigate();
  const location = useLocation();
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const latest = useRef<ChatMessage[]>([]);
  const [before, setBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [retry, setRetry] = useState(0);
  const [offline, setOffline] = useState(!navigator.onLine);
  const busy = useRef(false);
  const request = useRef<{ body: string; id: string } | null>(null);
  const history = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const acknowledged = useRef(0);
  const fetched = useRef(0);
  const stickToBottom = useRef(true);
  const load = useCallback(async () => {
    const ticket = ++fetched.current;
    try {
      const target = await api.context({ conversationId, responseId });
      let result = target.id ? await api.history(target.id) : { items: [], nextBefore: null };
      let incoming = result.items;
      const priorLatest = latest.current[latest.current.length - 1]?.sequence;
      // Reconcile all missed pages after a long disconnect, not only the latest 50 messages.
      while (target.id && priorLatest && result.nextBefore && incoming[0]?.sequence > priorLatest) {
        result = await api.history(target.id, result.nextBefore);
        incoming = mergeMessages(result.items, incoming);
      }
      if (!alive.current || ticket !== fetched.current) return;
      setConversation(target);
      const combined = mergeMessages(latest.current, incoming);
      if (!latest.current.length) setBefore(result.nextBefore);
      latest.current = combined;
      setMessages(combined);
      setError("");
    } catch (failure) {
      if (alive.current && ticket === fetched.current)
        setError(
          failure instanceof Error ? failure.message : "This conversation could not be loaded.",
        );
    } finally {
      if (alive.current && ticket === fetched.current) setLoading(false);
    }
  }, [api, conversationId, responseId]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    void load();
  }, [load, revision, retry]);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (stickToBottom.current && history.current)
      history.current.scrollTop = history.current.scrollHeight;
  }, [messages]);
  useEffect(() => {
    const element = history.current;
    const id = conversation?.id;
    if (!element || !id || !messages.length) return;
    const visible = new Set<number>();
    let readPending = false;
    let cancelled = false;
    const acknowledge = async () => {
      if (
        cancelled ||
        readPending ||
        document.visibilityState !== "visible" ||
        !document.hasFocus()
      )
        return;
      const sequence = Math.max(0, ...visible);
      if (sequence <= acknowledged.current) return;
      readPending = true;
      let saved = false;
      try {
        await api.markRead(id, sequence);
        saved = true;
        if (!cancelled) {
          acknowledged.current = Math.max(acknowledged.current, sequence);
          void refresh();
        }
      } catch {
        /* Preserve unread state and retry when visibility or connectivity changes. */
      } finally {
        readPending = false;
        if (saved && !cancelled && Math.max(0, ...visible) > acknowledged.current)
          void acknowledge();
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const sequence = Number((entry.target as HTMLElement).dataset.readSequence);
          if (entry.isIntersecting && entry.intersectionRatio >= 1) visible.add(sequence);
          else visible.delete(sequence);
        }
        void acknowledge();
      },
      // The viewport root also clips against the history scrollport. An explicit
      // history root would count messages even when that entire region is offscreen.
      { threshold: 1 },
    );
    element.querySelectorAll("[data-read-sequence]").forEach((node) => observer.observe(node));
    const onVisible = () => {
      void acknowledge();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      cancelled = true;
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [api, conversation?.id, messages, refresh]);

  const send = async () => {
    if (busy.current || !draft.trim() || !conversation?.canSend) return;
    if (Array.from(draft).length > 4000) {
      setSendError("Keep your message to 4,000 characters or fewer.");
      return;
    }
    busy.current = true;
    setSending(true);
    setSendError("");
    setStatus("");
    if (request.current?.body !== draft) request.current = { body: draft, id: crypto.randomUUID() };
    try {
      const sent = await api.send({
        conversationId: conversation.id ?? undefined,
        responseId,
        requestId: request.current.id,
        body: request.current.body,
      });
      if (!alive.current) return;
      setDraft("");
      request.current = null;
      setStatus("Message sent.");
      stickToBottom.current = true;
      void refresh();
      if (location.pathname !== `/messages/${sent.conversationId}`)
        navigate(`/messages/${sent.conversationId}${suffix}`, { replace: true });
      else await load();
    } catch (failure) {
      if (alive.current)
        setSendError(
          failure instanceof Error ? failure.message : "Your message could not be sent. Try again.",
        );
    } finally {
      busy.current = false;
      if (alive.current) setSending(false);
    }
  };
  const loadEarlier = async () => {
    if (!conversation?.id || !before) return;
    try {
      const result = await api.history(conversation.id, before);
      if (!alive.current) return;
      stickToBottom.current = false;
      latest.current = mergeMessages(result.items, latest.current);
      setMessages(latest.current);
      setBefore(result.nextBefore);
      setError("");
    } catch {
      if (alive.current) setError("Earlier messages could not be loaded. Try again.");
    }
  };
  return (
    <Stack gap="lg">
      <Link to={`/messages${suffix}`} className={styles.back}>
        Back to messages
      </Link>
      {loading ? (
        <div role="status" aria-label="Loading conversation">
          <Skeleton />
        </div>
      ) : null}
      {error ? (
        <Alert tone="danger">
          {error}
          <Button variant="quiet" onClick={() => setRetry((value) => value + 1)}>
            Try again
          </Button>
        </Alert>
      ) : null}
      {conversation ? (
        <>
          <header>
            <h2 className={styles.sectionTitle}>{conversation.productName}</h2>
            <p className={styles.muted}>{conversation.peerName}</p>
          </header>
          {offline ? (
            <Alert>You’re offline. Your draft is kept here. Reconnect to send it.</Alert>
          ) : !connected ? (
            <p className={styles.muted} role="status">
              Reconnecting to live messages…
            </p>
          ) : null}
          <div
            ref={history}
            className={styles.history}
            role="region"
            aria-label="Message history"
            tabIndex={0}
            onScroll={(event) => {
              const node = event.currentTarget;
              stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
            }}
          >
            {before ? (
              <Button variant="quiet" onClick={() => void loadEarlier()}>
                Load earlier messages
              </Button>
            ) : null}
            {!messages.length ? (
              <p className={styles.muted}>Start a conversation about {conversation.productName}.</p>
            ) : null}
            <ol className={styles.messages}>
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={styles.message}
                  data-own={message.senderUserId === currentUser?.id}
                >
                  <span className={styles.sender}>
                    {message.senderUserId === currentUser?.id ? "You" : conversation.peerName}
                  </span>
                  <p className={styles.body}>{message.body}</p>
                  <time
                    className={styles.time}
                    dateTime={message.createdAt}
                    data-read-sequence={message.sequence}
                  >
                    {formatDateTime(message.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          </div>
          <p className="ds-sr-only" role="status">
            {messages.length
              ? `${messages.length} ${messages.length === 1 ? "message" : "messages"} loaded.`
              : ""}{" "}
            {status}
          </p>
          {conversation.canSend ? (
            <form
              className={styles.composer}
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <Textarea
                label="Message"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setSendError("");
                }}
                disabled={sending}
                helpText={`${Array.from(draft).length.toLocaleString()} / 4,000 characters. Enter adds a new line.`}
                error={sendError}
                rows={3}
              />
              <div className={styles.send}>
                <Button
                  type="submit"
                  loading={sending}
                  loadingLabel="Sending…"
                  disabled={!draft.trim() || offline}
                >
                  Send message
                </Button>
              </div>
            </form>
          ) : (
            <Alert>This person is currently unavailable for messaging.</Alert>
          )}
        </>
      ) : null}
    </Stack>
  );
}
