import { afterEach, expect, it, vi } from "vitest";
import { chatApi } from "../../src/lib/chat";

const backend = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({ requireSupabase: () => backend }));
afterEach(() => {
  vi.restoreAllMocks();
  backend.rpc.mockReset();
});

it("aborts a stalled inbox read and allows a subsequent read to recover", async () => {
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(controller.signal);
  const abortSignal = vi.fn(
    (signal: AbortSignal) =>
      new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () => resolve({ data: null, error: { code: "", message: "aborted" } }),
          { once: true },
        );
      }),
  );
  backend.rpc.mockReturnValueOnce({ abortSignal });
  const pending = chatApi.list();
  const failure = expect(pending).rejects.toThrow("Messages could not be loaded or saved");
  controller.abort();
  await failure;
  expect(timeout).toHaveBeenCalledWith(15_000);
  expect(abortSignal).toHaveBeenCalledWith(controller.signal);
  const result = { items: [], nextBefore: null, unreadCount: 2 };
  backend.rpc.mockReturnValueOnce({
    abortSignal: () => Promise.resolve({ data: result, error: null }),
  });
  await expect(chatApi.list(50)).resolves.toEqual(result);
  expect(backend.rpc).toHaveBeenLastCalledWith("chat_list", { p_before: 50 });
});

it("retains the existing send request and idempotency key without a read deadline", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const result = { conversationId: "conversation", messageId: "message" };
  backend.rpc.mockResolvedValueOnce({ data: result, error: null });
  await expect(
    chatApi.send({ conversationId: "conversation", requestId: "retry-key", body: "Hello" }),
  ).resolves.toEqual(result);
  expect(timeout).not.toHaveBeenCalled();
  expect(backend.rpc).toHaveBeenCalledWith("chat_send", {
    p_request_id: "retry-key",
    p_body: "Hello",
    p_conversation_id: "conversation",
    p_response_id: null,
  });
});
