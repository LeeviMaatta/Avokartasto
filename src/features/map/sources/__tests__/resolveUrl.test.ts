import { describe, expect, it } from "vitest";
import { requiredSecrets, resolveSourceUrl } from "../resolveUrl";

describe("resolveUrl", () => {
  it("extracts unique secrets from url placeholders and auth JSON", () => {
    expect(
      requiredSecrets({
        url: "https://example.com/{z}/{x}/{y}.png?api-key={secret:mmlKey}&dup={secret:mmlKey}",
        auth: JSON.stringify({ username: "lantmaterietUsername", password: "lantmaterietPassword" }),
      }),
    ).toEqual(["mmlKey", "lantmaterietUsername", "lantmaterietPassword"]);
  });

  it("interpolates and URL-encodes secrets safely", () => {
    const resolved = resolveSourceUrl("https://api.test/tiles?key={secret:mmlKey}", {
      mmlKey: "abc+123/xyz",
    });
    expect(resolved).toBe("https://api.test/tiles?key=abc%2B123%2Fxyz");
  });
});
