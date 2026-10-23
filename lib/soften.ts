// 사용자에게 보이는 글에서 '미확인'이라는 단정적 표기를 '재확인 필요'로 통일한다(2026-10-22 마스터 지시).
// 원본 Markdown(진실의 원천)은 바꾸지 않고, 모델에 보내는 context·화면 표시 단계에서만 적용한다.
// 의미는 같다: 근거를 아직 확인하지 못했으니 다시 확인해야 한다.
export function soften(s: string): string {
  if (!s || !s.includes("미확인")) return s
  return s
    .replace(/미확인입니다/g, "재확인이 필요합니다")
    .replace(/미확인이다/g, "재확인이 필요하다")
    .replace(/미확인이며/g, "재확인이 필요하며")
    .replace(/미확인이고/g, "재확인이 필요하고")
    .replace(/미확인으로/g, "재확인 필요로")
    .replace(/미확인/g, "재확인 필요")
}

// 스트리밍 답변용: 청크 경계에서 '미확인'이 쪼개져도 놓치지 않도록 끝의 '미'·'미확'·'미확인'만 다음 청크까지 붙잡아 둔다.
type Part = { type: string; id?: string; text?: string; [k: string]: unknown }
export function softenTransform(): TransformStream<Part, Part> {
  const held = new Map<string, string>()
  return new TransformStream<Part, Part>({
    transform(part, ctrl) {
      if (part.type === "text-delta" && typeof part.text === "string") {
        const id = part.id ?? ""
        let t = (held.get(id) ?? "") + part.text
        const m = /(미확인[가-힣]{0,2}|미확|미)$/.exec(t)
        const keep = m ? m[1] : ""
        if (keep) t = t.slice(0, -keep.length)
        held.set(id, keep)
        t = soften(t)
        if (t) ctrl.enqueue({ ...part, text: t })
      } else if (part.type === "text-end") {
        const id = part.id ?? ""
        const rest = soften(held.get(id) ?? "")
        if (rest) ctrl.enqueue({ type: "text-delta", id, text: rest })
        held.delete(id)
        ctrl.enqueue(part)
      } else ctrl.enqueue(part)
    },
  })
}

// 추론(🔮) 문단 가드: 모델이 프롬프트 금지를 어기고 근거에 없는 숫자를 추론 문단에 써도 사용자에게 나가지 않도록,
// '🔮'가 나온 뒤의 글(답변 맨 끝)만 붙잡아 두었다가 끝에서 검사한다. 숫자가 근거 안에 없으면 문단 전체를 안내 문구로 바꾼다.
export function inferenceGuard(hasUnsupported: (text: string) => boolean): TransformStream<Part, Part> {
  const state = new Map<string, { buf: string; tail: string; held: boolean }>()
  const OMIT = "🔮 **추론 생략** — 추론 문장에 근거에 없는 수치가 포함되어 표시하지 않았습니다. 해당 정보는 재확인 필요합니다.\n"
  return new TransformStream<Part, Part>({
    transform(part, ctrl) {
      const id = part.id ?? ""
      if (part.type === "text-delta" && typeof part.text === "string") {
        const st = state.get(id) ?? { buf: "", tail: "", held: false }
        state.set(id, st)
        if (st.held) { st.buf += part.text; return }
        let t = st.tail + part.text
        st.tail = ""
        const i = t.indexOf("🔮")
        if (i >= 0) {
          // 소제목 표시(##, ---, 목록 기호)도 같이 붙잡는다
          const head = t.slice(0, i), m = /(?:[\s#*>-]*)$/.exec(head)
          const cut = m ? head.length - m[0].length : head.length
          const emit = head.slice(0, cut)
          st.held = true; st.buf = head.slice(cut) + t.slice(i)
          if (emit) ctrl.enqueue({ ...part, text: emit })
          return
        }
        // 청크 끝의 공백·#·-·* 는 다음 청크에서 🔮가 이어질 수 있어 한 청크 늦춘다
        const m2 = /[\s#*>-]*$/.exec(t)
        const keep = m2 ? m2[0] : ""
        if (keep) { st.tail = keep; t = t.slice(0, -keep.length) }
        if (t) ctrl.enqueue({ ...part, text: t })
      } else if (part.type === "text-end") {
        const st = state.get(id)
        if (st) {
          const out = st.held ? (hasUnsupported(st.buf) ? "\n\n" + OMIT : st.buf) : st.tail
          if (out) ctrl.enqueue({ type: "text-delta", id, text: out })
          state.delete(id)
        }
        ctrl.enqueue(part)
      } else ctrl.enqueue(part)
    },
  })
}

// 서버가 만든 글(사양표)을 모델 답변 앞에 붙인다: 첫 text-delta 직전에 prefix를 먼저 내보낸다.
export function prefixInjector(prefix: string): TransformStream<Part, Part> {
  let done = !prefix
  return new TransformStream<Part, Part>({
    transform(part, ctrl) {
      if (!done && part.type === "text-delta") {
        done = true
        ctrl.enqueue({ ...part, text: prefix + "\n\n" })
      }
      ctrl.enqueue(part)
    },
    flush(ctrl) { void ctrl },
  })
}

// 존재하지 않는 근거 표기([C1]인데 claim이 없음 등)를 스트림에서 제거한다. 허위 인용은 보여 주는 것보다 지우는 편이 안전하다(2026-10-22: CHCNAV 답변이 claim 없이 [C1]을 반복).
// 유효한 핸들만 남긴다. '[' 뒤 닫는 ']'가 올 때까지(최대 8자) 붙잡아 청크 경계를 처리한다.
export function citationGuard(valid: Set<string>, onDrop?: (h: string) => void): TransformStream<Part, Part> {
  const held = new Map<string, string>()
  const clean = (t: string) => t.replace(/\s?\[((?:C|R|P)\d+)\]/g, (m, h) => (valid.has(h) ? m : (onDrop?.(h), "")))
  return new TransformStream<Part, Part>({
    transform(part, ctrl) {
      const id = part.id ?? ""
      if (part.type === "text-delta" && typeof part.text === "string") {
        let t = (held.get(id) ?? "") + part.text
        const i = t.lastIndexOf("[")
        let keep = ""
        if (i >= 0 && !t.slice(i).includes("]") && t.length - i <= 8) { keep = t.slice(i); t = t.slice(0, i) }
        held.set(id, keep)
        t = clean(t)
        if (t) ctrl.enqueue({ ...part, text: t })
      } else if (part.type === "text-end") {
        const rest = clean(held.get(id) ?? "")
        if (rest) ctrl.enqueue({ type: "text-delta", id, text: rest })
        held.delete(id)
        ctrl.enqueue(part)
      } else ctrl.enqueue(part)
    },
  })
}

// 모델이 끝내 응답하지 않아 스트림이 오류로 끝나면(글자가 하나도 나가기 전에만) 오류 대신 대체 답변을 같은 스트림에 흘린다.
export function degradeOnError(makeText: () => string, onUse?: () => void): TransformStream<Part, Part> {
  let started = false
  return new TransformStream<Part, Part>({
    transform(part, ctrl) {
      if (part.type === "text-delta") started = true
      if (part.type === "error" && !started) {
        started = true
        onUse?.()
        const id = "degraded"
        ctrl.enqueue({ type: "text-start", id })
        ctrl.enqueue({ type: "text-delta", id, text: makeText() })
        ctrl.enqueue({ type: "text-end", id })
        return
      }
      ctrl.enqueue(part)
    },
  })
}
