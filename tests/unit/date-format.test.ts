import { expect, it } from "vitest";
import { formatCalendarDate, formatDate, formatDateTime } from "../../src/lib/format";

it("preserves local dates and times across repeated calls and timezone offsets", () => {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  for (const value of [
    "2026-01-01T00:00:00Z",
    "2026-07-03T22:59:00-07:00",
    "2024-02-29T12:00:00Z",
  ]) {
    expect(formatDate(value)).toBe(date.format(new Date(value)));
    expect(formatDateTime(value)).toBe(time.format(new Date(value)));
  }
  expect(formatCalendarDate("2026-01-01")).toBe("Jan 1, 2026");
  expect(formatCalendarDate("2024-02-29")).toBe("Feb 29, 2024");
  expect(() => formatDate("invalid")).toThrow(RangeError);
});
