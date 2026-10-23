"use client"
import { useSyncExternalStore } from "react"

// 화면 설정(낮/밤, 작업실 스킨 켬/끔)을 이 브라우저에만 저장한다. 서버 렌더는 기본값(자동·작업실)으로 그리고, 저장된 값이 있으면 마운트 뒤 바뀐다.
export type Theme = "system" | "light" | "dark"
export type Skin = "workshop" | "classic"
const KEY_THEME = "dw-theme", KEY_SKIN = "dw-skin"
const EVT = "dw-prefs"

function read<T extends string>(key: string, allowed: readonly T[], def: T): T {
  try {
    const v = localStorage.getItem(key)
    return (allowed as readonly string[]).includes(v ?? "") ? (v as T) : def
  } catch {
    return def
  }
}
function write(key: string, v: string) {
  try { localStorage.setItem(key, v) } catch { /* 저장이 막혀도 화면은 현재 세션에서 바뀐다 */ }
  window.dispatchEvent(new Event(EVT))
}
const sub = (cb: () => void) => {
  window.addEventListener(EVT, cb); window.addEventListener("storage", cb)
  const mq = window.matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener("change", cb)
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener("storage", cb); mq.removeEventListener("change", cb) }
}

export const applyTheme = (t: Theme) => {
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", dark)
}
export function useTheme(): [Theme, (t: Theme) => void] {
  const t = useSyncExternalStore(sub, () => read<Theme>(KEY_THEME, ["system", "light", "dark"], "system"), () => "system" as Theme)
  return [t, (n) => { write(KEY_THEME, n); applyTheme(n) }]
}
export function useSkin(): [Skin, (s: Skin) => void] {
  const s = useSyncExternalStore(sub, () => read<Skin>(KEY_SKIN, ["workshop", "classic"], "workshop"), () => "workshop" as Skin)
  return [s, (n) => write(KEY_SKIN, n)]
}
