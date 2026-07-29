"use client"

import { useEffect } from "react"

declare global {
  interface Window {
    google?: any
    googleTranslateElementInit?: () => void
  }
}

export default function LangToggle() {
  useEffect(() => {
    if (document.getElementById("gt-script")) return
    window.googleTranslateElementInit = () => {
      new window.google.translate.TranslateElement(
        { pageLanguage: "ko", includedLanguages: "ko,en", autoDisplay: false },
        "google_translate_element"
      )
    }
    const s = document.createElement("script")
    s.id = "gt-script"
    s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
    s.async = true
    document.body.appendChild(s)
  }, [])

  return <div id="google_translate_element" />
}
