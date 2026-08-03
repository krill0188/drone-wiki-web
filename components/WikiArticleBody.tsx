"use client"

import { useRef } from "react"
import TextSelectionPopup from "@/components/TextSelectionPopup"

export default function WikiArticleBody({ html, slug, title }: { html: string; slug: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <>
      <div
        ref={ref}
        className="prose prose-slate dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <TextSelectionPopup containerRef={ref} sourceSlug={slug} sourceTitle={title} />
    </>
  )
}
