export function requiredSecrets(source: { url?: string; auth?: string }): string[] {
  const values = [source.url ?? "", source.auth ?? ""].join(" ");
  const placeholders = [...values.matchAll(/\{secret:([A-Za-z0-9_-]+)\}/g)].map((match) => match[1]);
  let authKeys: string[] = [];
  try {
    const auth = JSON.parse(source.auth ?? "{}") as Record<string, unknown>;
    authKeys = [auth.username, auth.password].filter((value): value is string => typeof value === "string");
  } catch {
    authKeys = [];
  }
  return [...new Set([...placeholders, ...authKeys])];
}

export function resolveSourceUrl(template: string, settings: Record<string, string>): string {
  return template.replace(/\{secret:([A-Za-z0-9_-]+)\}/g, (_, key: string) => encodeURIComponent(settings[key] ?? ""));
}
