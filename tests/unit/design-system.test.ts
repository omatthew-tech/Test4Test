import { describe, expect, it } from "vitest";
import { tokens, tokenSourceHash } from "@test4test/design-system";

describe("design-system tokens", () => {
  it("keeps the approved Aegean primary value", () => {
    expect(tokens["semantic.color.action.primary"].value).toBe("#007BAE");
  });

  it("keeps the minimum target at 44px", () => {
    expect(tokens["primitive.size.target"].value).toBe("44px");
  });

  it("keeps the approved border, icon, and card sizing contract", () => {
    expect(tokens["semantic.border.width.default"].value).toBe("1px");
    expect(tokens["semantic.size.icon.small"].value).toBe("16px");
    expect(tokens["semantic.size.icon.medium"].value).toBe("20px");
    expect(tokens["semantic.size.icon.large"].value).toBe("24px");
    expect(tokens["semantic.space.inset.card-mobile"].value).toBe("20px");
    expect(tokens["semantic.space.inset.card-desktop"].value).toBe("24px");
  });

  it("retains the DTCG 2025.10 value shape alongside generated values", () => {
    expect(tokens["semantic.border.width.default"].dtcgValue).toEqual({
      value: 1,
      unit: "px",
    });
    expect(tokens["semantic.color.action.primary"].dtcgValue).toMatchObject({
      colorSpace: "srgb",
      alpha: 1,
      hex: "#007BAE",
    });
  });

  it("records deterministic source provenance", () => {
    expect(tokenSourceHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
