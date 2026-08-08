import { describe, expect, it } from "vitest";
import {
  getOrderedAccessLinks,
  normalizeAccessLinks,
  productTypesFromAccessLinks,
} from "../../src/lib/format";
import {
  MAX_INSTRUCTION_STEPS,
  normalizeInstructionSteps,
  parseLegacyInstructions,
  serializeInstructionSteps,
} from "../../src/lib/instructions";
import { validateAccessLink } from "../../src/lib/questions";

describe("submission instruction steps", () => {
  it("normalizes structured steps and caps them at five", () => {
    expect(
      normalizeInstructionSteps([
        " First task ",
        "",
        "Second",
        "Third",
        "Fourth",
        "Fifth",
        "Sixth",
      ]),
    ).toEqual(["First task", "Second", "Third", "Fourth", "Fifth"]);
    expect(MAX_INSTRUCTION_STEPS).toBe(5);
  });

  it("reads legacy prose and writes the compatibility mirror", () => {
    expect(normalizeInstructionSteps(undefined, "Browse the existing app.")).toEqual([
      "Browse the existing app.",
    ]);
    expect(parseLegacyInstructions("1. Browse the home page\n2) Sign up for an account")).toEqual([
      "Browse the home page",
      "Sign up for an account",
    ]);
    expect(serializeInstructionSteps(["Browse", " Sign up "])).toBe("Browse\nSign up");
  });
});

describe("submission resource links", () => {
  it("normalizes legacy links and the labeled Other shape", () => {
    expect(
      normalizeAccessLinks({
        website: " test4test.io ",
        figma: " https://figma.com/proto/example ",
        other: { label: " Prototype ", url: " https://example.com/demo " },
      }),
    ).toEqual({
      website: "test4test.io",
      figma: "https://figma.com/proto/example",
      other: { label: "Prototype", url: "https://example.com/demo" },
    });

    expect(normalizeAccessLinks({ other: "https://example.com/legacy" })).toEqual({
      other: { label: "Other", url: "https://example.com/legacy" },
    });
  });

  it("orders every resource while deriving product types only from testable platforms", () => {
    const accessLinks = {
      other: { label: "Demo", url: "https://example.com/demo" },
      android: "https://play.google.com/store/apps/details?id=example",
      website: "https://example.com",
      figma: "https://figma.com/proto/example",
      ios: "https://apps.apple.com/app/example",
    };

    expect(productTypesFromAccessLinks(accessLinks)).toEqual(["website", "ios", "android"]);
    expect(getOrderedAccessLinks(accessLinks).map((link) => link.kind)).toEqual([
      "website",
      "ios",
      "android",
      "figma",
      "other",
    ]);
    expect(getOrderedAccessLinks(accessLinks)[4]).toMatchObject({
      kind: "other",
      productType: null,
      label: "Demo",
    });
  });

  it("rejects private website targets", () => {
    expect(validateAccessLink("localhost:3000", "website").valid).toBe(false);
    expect(validateAccessLink("https://example.com", "website").valid).toBe(true);
  });
});
