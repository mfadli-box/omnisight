"use client";

import { useSyncExternalStore } from "react";
import { parseSession, storageKey, type SessionData } from "@/lib/utility";

let cachedRaw: string | null = null;
let cachedSession: SessionData | null = null;

const subscribeSession = () => () => {};

const readSessionSnapshot = (): SessionData | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey);
  if (raw === cachedRaw) return cachedSession;
  cachedRaw = raw;
  cachedSession = parseSession(raw);
  return cachedSession;
};

export function useSessionSnapshot(): SessionData | null {
  return useSyncExternalStore(subscribeSession, readSessionSnapshot, () => null);
}
