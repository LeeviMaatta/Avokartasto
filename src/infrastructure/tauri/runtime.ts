import { invoke } from "@tauri-apps/api/core";

export const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const invokeTauri = invoke;
