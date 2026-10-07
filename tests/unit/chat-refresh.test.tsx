import { act, cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChatProvider, useChat, useChatUnreadCount } from "../../src/context/ChatContext";
import type { ChatInbox } from "../../src/lib/chat";

const backend = vi.hoisted(() => ({
  userId: "owner" as string | undefined,
  list: vi.fn<() => Promise<ChatInbox>>(),
  changed: () => {},
  connection: (_connected: boolean) => {},
}));
vi.mock("../../src/context/AppStateContext", () => ({
  useAppState: () => ({
    currentUser: backend.userId ? { id: backend.userId } : null,
    state: {},
  }),
}));
vi.mock("../../src/lib/chat", () => ({
  chatApi: {
    list: backend.list,
    subscribe: (_user: string, changed: () => void, connection: (value: boolean) => void) => {
      backend.changed = changed;
      backend.connection = connection;
      return () => {};
    },
  },
}));

let value: ReturnType<typeof useChat>;
let unreadRenders = 0;
function Probe() {
  value = useChat();
  return <output>{value.loading ? "loading" : value.error || value.inbox.unreadCount}</output>;
}
function UnreadProbe() {
  unreadRenders++;
  return <span data-testid="unread">{useChatUnreadCount()}</span>;
}
function tree(strict = false) {
  const content = (
    <ChatProvider>
      <Probe />
      <UnreadProbe />
    </ChatProvider>
  );
  return strict ? <StrictMode>{content}</StrictMode> : content;
}
function pendingRead() {
  let resolve!: (result: ChatInbox) => void;
  const promise = new Promise<ChatInbox>((done) => {
    resolve = done;
  });
  backend.list.mockReturnValueOnce(promise);
  return (unreadCount: number) => resolve({ items: [], nextBefore: null, unreadCount });
}
beforeEach(() => {
  backend.userId = "owner";
  backend.list.mockReset().mockResolvedValue({ items: [], nextBefore: null, unreadCount: 0 });
  unreadRenders = 0;
});
afterEach(cleanup);

it("coalesces in-flight invalidations and waits for the fresh follow-up result", async () => {
  const first = pendingRead();
  const latest = pendingRead();
  render(tree());
  let refresh!: Promise<void>;
  act(() => {
    for (let index = 0; index < 20; index++) backend.changed();
    refresh = value.refresh();
  });
  expect(backend.list).toHaveBeenCalledTimes(1);
  await act(async () => {
    first(9);
  });
  expect(backend.list).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId("unread").textContent).toBe("0");
  await act(async () => {
    latest(2);
    await refresh;
  });
  expect(screen.getByTestId("unread").textContent).toBe("2");
  expect(value.loading).toBe(false);
});

it("does not rerender unread-only consumers for connection or unchanged inbox updates", async () => {
  render(tree());
  await act(async () => {});
  const renders = unreadRenders;
  await act(async () => {
    backend.connection(true);
    backend.changed();
  });
  expect(unreadRenders).toBe(renders);
  expect(value.connected).toBe(true);
});

it("releases failed requests so retry can recover", async () => {
  backend.list.mockRejectedValueOnce(new Error("Temporarily unavailable"));
  render(tree());
  await act(async () => {});
  expect(value.error).toBe("Temporarily unavailable");
  await act(async () => {
    await value.refresh();
  });
  expect(value.error).toBe("");
  expect(backend.list).toHaveBeenCalledTimes(2);
});

it("keeps invalidations that arrive while the completed request is settling", async () => {
  const first = pendingRead();
  render(tree());
  await act(async () => {
    first(5);
    queueMicrotask(() => {
      void value.refresh();
    });
  });
  expect(backend.list).toHaveBeenCalledTimes(2);
  expect(value.inbox.unreadCount).toBe(0);
});

it("does not start queued work after unmount", async () => {
  const first = pendingRead();
  const view = render(tree());
  act(() => {
    backend.changed();
  });
  view.unmount();
  await act(async () => {
    first(5);
  });
  expect(backend.list).toHaveBeenCalledTimes(1);
});

it("does not carry a pending inbox across sign-out", async () => {
  const first = pendingRead();
  const view = render(tree());
  backend.userId = undefined;
  view.rerender(tree());
  await act(async () => {
    first(5);
  });
  expect(screen.getByTestId("unread").textContent).toBe("0");
  expect(backend.list).toHaveBeenCalledTimes(1);
});

it("finishes loading after the Strict Mode effect cleanup and restart", async () => {
  const first = pendingRead();
  render(tree(true));
  await act(async () => {
    first(5);
  });
  expect(backend.list).toHaveBeenCalledTimes(2);
  expect(value.loading).toBe(false);
  expect(value.inbox.unreadCount).toBe(0);
});
