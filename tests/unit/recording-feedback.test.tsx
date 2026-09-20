import type { StarRating } from "../../src/types";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seededState } from "../../src/data/seeds";
import { RecordingFeedback } from "../../src/pages/RecordingFeedback";
import { createRecordingShareUrl } from "../../src/lib/recordingShare";
import {
  loadRecordingRating,
  loadRecordingContact,
  saveRecordingRating,
} from "../../src/lib/recordingFeedback";

vi.mock("../../src/lib/recordingFeedback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/recordingFeedback")>()),
  loadRecordingRating: vi.fn(),
  loadRecordingContact: vi.fn(),
  saveRecordingRating: vi.fn(),
  requestTipPaymentMethods: vi.fn(),
}));
vi.mock("../../src/lib/recordingShare", () => ({ createRecordingShareUrl: vi.fn() }));

const response = seededState.responses[0];
function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}
function mount(selected = response) {
  return render(
    <MemoryRouter>
      <LocationProbe />
      <RecordingFeedback
        key={selected.id}
        response={selected}
        userId="owner"
        productName="MastoMetrics"
        fixtureMode={false}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(createRecordingShareUrl)
    .mockReset()
    .mockResolvedValue("https://test4test.io/recordings/shared#test-token");
  vi.mocked(loadRecordingRating).mockReset().mockResolvedValue(null);
  vi.mocked(saveRecordingRating).mockReset().mockResolvedValue(undefined);
  vi.mocked(loadRecordingContact)
    .mockReset()
    .mockResolvedValue({ email: "tester@example.com", paypalHandle: "tester" });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

it("keeps the selected stars as a draft until Submit saves the rating", async () => {
  vi.mocked(loadRecordingRating).mockResolvedValue(3);
  mount();
  await waitFor(() =>
    expect((screen.getByRole("radio", { name: "3 stars" }) as HTMLInputElement).checked).toBe(true),
  );
  expect(screen.queryByRole("button", { name: "Clear rating" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "5 stars" }));
  expect((screen.getByRole("radio", { name: "5 stars" }) as HTMLInputElement).checked).toBe(true);
  expect(saveRecordingRating).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText("5 stars saved.");
  expect(saveRecordingRating).toHaveBeenCalledWith(response.id, "owner", 5);
  expect((screen.getByRole("radio", { name: "5 stars" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Clear rating" })).toBeNull();
});

it("retains the draft after a failed submission so the user can retry", async () => {
  vi.mocked(loadRecordingRating).mockResolvedValue(2);
  vi.mocked(saveRecordingRating).mockRejectedValueOnce(new Error("Could not save. Try again."));
  mount();
  await waitFor(() =>
    expect((screen.getByRole("radio", { name: "2 stars" }) as HTMLInputElement).checked).toBe(true),
  );
  fireEvent.click(screen.getByRole("radio", { name: "4 stars" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByRole("alert");
  expect((screen.getByRole("radio", { name: "4 stars" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText("4 stars saved.");
  expect(saveRecordingRating).toHaveBeenCalledTimes(2);
  expect(saveRecordingRating).toHaveBeenLastCalledWith(response.id, "owner", 4);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("submits only the latest selection and prevents duplicate pending submissions", async () => {
  let finish!: () => void;
  vi.mocked(saveRecordingRating).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  mount();
  await act(async () => {});
  fireEvent.click(screen.getByRole("radio", { name: "5 stars" }));
  fireEvent.click(screen.getByRole("radio", { name: "3 stars" }));
  expect(saveRecordingRating).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  const pending = screen.getByRole("button", { name: "Submitting…" }) as HTMLButtonElement;
  expect(pending.disabled).toBe(true);
  expect(screen.getAllByRole("radio").every((radio) => (radio as HTMLInputElement).disabled)).toBe(
    true,
  );
  fireEvent.click(pending);
  expect(saveRecordingRating).toHaveBeenCalledTimes(1);
  expect(saveRecordingRating).toHaveBeenCalledWith(response.id, "owner", 3);
  await act(async () => finish());
  await screen.findByText("3 stars saved.");
});

it("retries a failed load before allowing a rating to overwrite unknown state", async () => {
  vi.mocked(loadRecordingRating)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(4);
  mount();
  await screen.findByRole("alert");
  expect((screen.getByRole("radio", { name: "5 stars" }) as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Retry rating" }));
  await waitFor(() =>
    expect((screen.getByRole("radio", { name: "4 stars" }) as HTMLInputElement).checked).toBe(true),
  );
});

it("loads tip details on demand and opens in-app chat without loading email details", async () => {
  mount();
  await act(async () => {});
  expect(loadRecordingContact).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Tip" }));
  expect((await screen.findByRole("link", { name: "Open PayPal" })).getAttribute("href")).toBe(
    "https://paypal.me/tester",
  );
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  vi.mocked(loadRecordingContact).mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Message" }));
  expect(screen.getByTestId("location").textContent).toBe(`/messages?response=${response.id}`);
  expect(loadRecordingContact).not.toHaveBeenCalled();
});

it("explains missing public-tester contact details without making a request", async () => {
  mount({ ...response, testerUserId: null });
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Tip" }));
  await screen.findByText("This public recording has no tester contact details.");
  expect(loadRecordingContact).not.toHaveBeenCalled();
});

it("ignores a late load after moving to another recording", async () => {
  let finish!: (value: StarRating) => void;
  vi.mocked(loadRecordingRating).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const first = mount();
  first.unmount();
  mount({ ...response, id: "next-recording" });
  await act(async () => finish(5));
  expect(screen.getAllByRole("radio").some((radio) => (radio as HTMLInputElement).checked)).toBe(
    false,
  );
});

it("shares the selected recording on demand without loading tester contact details", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  mount();
  await act(async () => {});
  expect(createRecordingShareUrl).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  await screen.findByRole("dialog", { name: "Share recording" });
  await screen.findByText("Anyone with this link can view this recording. No sign up required.");
  const input = (await screen.findByRole("textbox", {
    name: "Recording link",
  })) as HTMLInputElement;
  expect(input.readOnly).toBe(true);
  expect(input.value).toBe("https://test4test.io/recordings/shared#test-token");
  expect(createRecordingShareUrl).toHaveBeenCalledWith(response.id);
  expect(loadRecordingContact).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  await screen.findByRole("button", { name: "Copied" });
  expect(writeText).toHaveBeenCalledWith(input.value);
  await screen.findByText("Recording link copied.");
});

it("keeps the link selectable when clipboard access is denied", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
  });
  mount({ ...response, testerUserId: null });
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  fireEvent.click(await screen.findByRole("button", { name: "Copy link" }));
  await screen.findByText(
    "We couldn’t copy the link. Select the recording link and copy it manually.",
  );
  expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  const input = screen.getByRole("textbox", { name: "Recording link" }) as HTMLInputElement;
  fireEvent.focus(input);
  expect(input.selectionEnd! - input.selectionStart!).toBe(input.value.length);
});

it("allows retrying link creation and resets feedback when reopened", async () => {
  vi.mocked(createRecordingShareUrl).mockRejectedValueOnce(new Error("Sharing is offline."));
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  await screen.findByText("Sharing is offline.");
  expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("textbox", { name: "Recording link" });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  await screen.findByRole("button", { name: "Copy link" });
  expect(createRecordingShareUrl).toHaveBeenCalledTimes(3);
});
