"use client"
import { useMemo } from "react"
import { remark } from "remark"
import remarkGfm from "remark-gfm"
import remarkHtml from "remark-html"

// 모델 답변·단계 결과의 Markdown(표, 굵게, 목록, 코드)을 화면용으로 바꾼다.
// remark-html은 기본으로 출력을 정화(sanitize)하므로 스크립트·위험한 속성은 제거된다(모델 출력은 믿지 않는다).
// 링크는 새 창으로 열고(rel 보강), 표는 좁은 화면에서 가로로 스크롤된다.
const proc = remark().use(remarkGfm).use(remarkHtml)

export default function MarkdownText({ text, className = "" }: { text: string; className?: string }) {
  const html = useMemo(() => {
    try {
      return String(proc.processSync(text)).replace(/<a href="(https?:[^"]+)"/g, '<a target="_blank" rel="noopener noreferrer" href="$1"')
    } catch {
      return null
    }
  }, [text])
  if (html === null) return <div className={`whitespace-pre-wrap ${className}`}>{text}</div>
  return <div className={`md-text ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
