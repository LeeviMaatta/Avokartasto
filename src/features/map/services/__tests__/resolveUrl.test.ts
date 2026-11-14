import { describe, expect, it } from "vitest";
import { getSecretValue, requiredSecrets, resolveSourceUrl } from "../resolveUrl";

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

  it("resolves custom API keys stored in customApiKeys JSON", () => {
    const settings = {
      customApiKeys: JSON.stringify({ maptilerKey: "mt-secret-123" }),
    };
    expect(getSecretValue(settings, "maptilerKey")).toBe("mt-secret-123");
    expect(resolveSourceUrl("https://api.maptiler.com/maps/{z}/{x}/{y}.png?key={secret:maptilerKey}", settings)).toBe(
      "https://api.maptiler.com/maps/{z}/{x}/{y}.png?key=mt-secret-123",
    );
  });
});
