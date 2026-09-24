"use client";
import { useEffect } from "react";

/** Lightweight cross-component "data changed" signal so every open view refreshes after a mutation. */
export const emitChange = () => window.dispatchEvent(new Event("crm:changed"));

export function useOnChange(fn: () => void) {
  useEffect(() => {
    window.addEventListener("crm:changed", fn);
    return () => window.removeEventListener("crm:changed", fn);
  }, [fn]);
}
