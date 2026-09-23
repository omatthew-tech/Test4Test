import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MessagesPage } from "../../src/pages/MessagesPage";
import type { ChatApi, ChatConversation } from "../../src/lib/chat";

const mocks = vi.hoisted(() => ({
  api: {} as ChatApi,
  refresh: vi.fn(),
  observer: null as IntersectionObserverCallback | null,
  hidden: false,
}));
const conversation: ChatConversation = {
  id: "thread",
  submissionId: "app",
  productName: "Example app",
  peerName: "Tester",
  canSend: true,
  lastSequence: 1,
  lastMessage: "Hello",
  lastMessageAt: "2026-09-20T15:00:00Z",
  unreadCount: 1,
};
vi.mock("../../src/context/ChatContext", () => ({
  useChat: () => ({
    api: mocks.api,
    refresh: mocks.refresh,
    revision: 0,
    connected: true,
    inbox: { items: [conversation], nextBefore: null, unreadCount: 1 },
    loading: false,
    error: "",
  }),
}));
vi.mock("../../src/context/AppStateContext", () => ({
  useAccountState: () => ({ currentUser: { id: "founder" } }),
}));
vi.mock("../../src/components/Layout", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
beforeEach(() => {
  mocks.hidden = false;
  mocks.observer = null;
  mocks.refresh.mockReset();
  mocks.api = {
    context: vi.fn().mockResolvedValue(conversation),
    history: vi.fn().mockResolvedValue({
      items: [
        {
          id: "message",
          sequence: 1,
          conversationId: "thread",
          senderUserId: "tester",
          body: "Hello",
          createdAt: "2026-09-20T15:00:00Z",
        },
      ],
      nextBefore: null,
    }),
    send: vi.fn().mockResolvedValue({ conversationId: "thread", messageId: "new-message" }),
    markRead: vi.fn().mockResolvedValue(undefined),
    list: vi.fn(),
    subscribe: vi.fn(),
  };
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() =>
    mocks.hidden ? "hidden" : "visible",
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        mocks.observer = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount() {
  return render(
    <MemoryRouter initialEntries={["/messages/thread"]}>
      <Routes>
        <Route path="/messages/:conversationId" element={<MessagesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

it("retains failed drafts and reuses the request ID when retrying an uncertain send", async () => {
  vi.mocked(mocks.api.send).mockRejectedValueOnce(new Error("Connection lost. Try again."));
  mount();
  const field = await screen.findByRole("textbox", { name: "Message" });
  fireEvent.change(field, { target: { value: "First line\nSecond line" } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByText("Connection lost. Try again.");
  expect((field as HTMLTextAreaElement).value).toBe("First line\nSecond line");
  const first = vi.mocked(mocks.api.send).mock.calls[0][0];
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe(""));
  expect(vi.mocked(mocks.api.send).mock.calls[1][0]).toEqual(first);
});

it("prevents duplicate pending sends and rejects oversized content before sending", async () => {
  let finish!: (value: { conversationId: string; messageId: string }) => void;
  vi.mocked(mocks.api.send).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  mount();
  const field = await screen.findByRole("textbox", { name: "Message" });
  fireEvent.change(field, { target: { value: "x".repeat(4001) } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(mocks.api.send).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: "Hello again" } });
  fireEvent.submit(field.closest("form")!);
  fireEvent.submit(field.closest("form")!);
  expect(mocks.api.send).toHaveBeenCalledTimes(1);
  await act(async () => finish({ conversationId: "thread", messageId: "new" }));
});

it("acknowledges only rendered, visible messages in a foreground conversation", async () => {
  mount();
  await screen.findByRole("textbox", { name: "Message" });
  await waitFor(() => expect(mocks.observer).not.toBeNull());
  expect(mocks.api.markRead).not.toHaveBeenCalled();
  const target = document.querySelector("[data-read-sequence]")!;
  mocks.hidden = true;
  await act(async () =>
    mocks.observer!(
      [{ target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
  expect(mocks.api.markRead).not.toHaveBeenCalled();
  mocks.hidden = false;
  fireEvent(document, new Event("visibilitychange"));
  await waitFor(() => expect(mocks.api.markRead).toHaveBeenCalledWith("thread", 1));
});

it("catches up across multiple pages after a disconnect without dropping history", async () => {
  mount();
  await screen.findByRole("textbox", { name: "Message" });
  const messages = Array.from({ length: 50 }, (_, index) => ({
    id: `m${index + 52}`,
    sequence: index + 52,
    conversationId: "thread",
    senderUserId: "tester",
    body: `New ${index}`,
    createdAt: "2026-09-20T15:00:00Z",
  }));
  vi.mocked(mocks.api.history)
    .mockResolvedValueOnce({ items: messages, nextBefore: 52 })
    .mockResolvedValueOnce({
      items: [{ ...messages[0], id: "bridge", sequence: 2, body: "Missed message" }],
      nextBefore: null,
    });
  // A successful send reconciles persisted history using the same path as reconnect.
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
    target: { value: "Reconnect" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByText("Missed message");
  expect(mocks.api.history).toHaveBeenCalledWith("thread", 52);
});
