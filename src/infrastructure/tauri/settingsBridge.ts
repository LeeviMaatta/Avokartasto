import { invokeTauri, inTauri } from "./runtime";

const LS = "karttasovellus.settings";

const readLocalSettings = (): Record<string, string> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LS) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Asetusten juuren on oltava objekti");
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch (error) {
    console.warn("Paikalliset asetukset olivat virheelliset ja palautettiin oletuksiin.", error);
    localStorage.removeItem(LS);
    return {};
  }
};

export const getSettings = async (): Promise<Record<string, string>> =>
  inTauri() ? invokeTauri("get_settings") : readLocalSettings();

export const setSetting = async (key: string, value: string) => {
  if (inTauri()) return invokeTauri<void>("set_setting", { key, value });
  const settings = readLocalSettings();
  settings[key] = value;
  localStorage.setItem(LS, JSON.stringify(settings));
};

export const setSettings = async (settings: Record<string, string>) => {
  if (inTauri()) return invokeTauri<void>("set_settings", { settings });
  localStorage.setItem(LS, JSON.stringify(settings));
};
