---
title: AI 지식 워크플로
created: 2026-07-21
updated: 2026-07-21
type: concept
tags:
  - automation
  - provenance
  - research
  - workflow
sources:
  - "raw/youtube/📺 How To Build LLM Wiki In Obsidian 🧠 A Memory Layer For Any Agentic AI.md"
  - "raw/youtube/📺 LLM Wiki를 업그레이드하는 외부 지식 시스템! 연구자를 위한 최강의 조합 Zotero × Notebook × Obsidian x Claude Code.md"
  - "raw/notebooklm/2026-07-16-all-notes.md"
  - "raw/notebooklm/llm-wiki-zotero-notebooklm-youtube.md"
confidence: medium
domain: ai-autonomy
contested: false
contradictions: []
---

# AI 지식 워크플로

AI 지식 워크플로는 원본 수집부터 검토된 지식과 산출물 생성까지를 역할별 계층으로 나누는 운영 방식이다. 개인 지식관리 체계 전체에서 이 흐름이 갖는 의미는 [[ai-personal-knowledge-management]]에 정리한다.

## 기본 흐름

    수집 → 원본 보존 → 탐색·질의 → 위키 컴파일 → 검증 → 산출

- Zotero와 브라우저 클리퍼는 원본과 서지정보를 수집한다.
- NotebookLM은 선택한 소스 묶음을 탐색하고 질문한다.
- LLM Wiki와 Obsidian은 장기 지식과 관계를 Markdown으로 유지한다.
- Understand Anything은 지식 연결과 공백 후보를 그래프로 탐색한다.
- 검토된 지식은 글, 보고서, 프레젠테이션 같은 산출물로 변환한다.

한 도구가 모든 책임을 갖지 않도록 원본 보존, 지식 합성, 구조 분석, 결과 표현을 분리하면 도구를 교체해도 축적된 Markdown과 출처 관계를 유지할 수 있다. ^[raw/youtube/📺 LLM Wiki를 업그레이드하는 외부 지식 시스템! 연구자를 위한 최강의 조합 Zotero × Notebook × Obsidian x Claude Code.md]

## 검증 관문

1. 원본과 요약이 분리되어 있는가?
2. 모든 핵심 주장에 추적 가능한 출처가 있는가?
3. 기존 문서와 중복되거나 충돌하지 않는가?
4. 내부 링크가 실제 문서를 가리키는가?
5. 산출물이 목적에 맞는 형식으로 직접 열리고 사용되는가?

## 위험과 제어

- 여러 에이전트가 같은 문서를 서로 다르게 해석할 수 있다.
- 프로젝트 README나 소개 영상의 홍보성 주장이 검증 없이 굳어질 수 있다.
- 자동화가 늘수록 잘못된 메타데이터가 빠르게 전파될 수 있다.

따라서 생성 속도는 출처, 링크, 스키마와 일관성 검사를 자동화할 때 비로소 장기 지식 품질로 이어진다.

구체적인 단계 배치는 [[knowledge-tool-roles]], 반복 운영 모델은 [[research-feedback-loop]], 연구 환경 구현은 [[second-brain-research-workflow]]를 참고한다. ^[raw/notebooklm/2026-07-16-all-notes.md]

## 📰 최근 관련 소식
- [Y르포] 60m 상공서 객체·사물 완벽 인식…안전·치안 구멍 메꾸는 AI드론 (v.daum.net, Mon, 03 Au) — https://news.google.com/rss/articles/CBMiRkFVX3lxTE53NnRpaXN4OVZWTUNYUEJpZ3ljM0lHaFR2SlcxSTExNWhiZWRxaXA3Q0xFcXh4am5wQS1mOEl4YmhQWEdYTUE?oc=5
- 광교호수공원서 드론으로 간식 받는다…수원시, 배송서비스 시작 (v.daum.net, Wed, 05 Au) — https://news.google.com/rss/articles/CBMiVEFVX3lxTE9YSk1CeXY4R25wMGpBYUVHdjRTVk91b1lvZTQxV3NmdnpVS3BSV2N2UFJtY2J1Z1VHLTNoYTNQaUlGTDZWSXFiaU02VW9LZ1loOFhYLQ?oc=5
- [리포트] 니어스랩, 코스닥 출사표···피지컬 AI 드론으로 방산시장 정조준 (팍스경제TV, Thu, 06 Au) — https://news.google.com/rss/articles/CBMiZ0FVX3lxTFAwMVgxZU1Jd3JVdkdUM09BYk9EM3UxZ2dqZVR1Y01rTVQxR1d4SmZ3dXYxaXBCVzl5enV5T3c3dXB3dU1lVy0zcTNNSmNSNHoxZ3ctdHRkZzU0Wlp4RzZYUm1HOXR6SjQ?oc=5
- 중국 'AI 군사화' 박차...타이완 '드론군 양성' 맞불 (YTN 사이언스, Thu, 06 Au) — https://news.google.com/rss/articles/CBMijAFBVV95cUxNVnpfR2JOam1zbWthUENVaTVvQkdJdGNGUHF5SThhZmxJOWhteXJ1QjZzdk50akhhT3R4c0pYemtfV25PeXgyMG5SNUZmVlVRY0IzYnFNMjVGZk9XeDMyc3hTN0pUUDBrems4X1VoS2pkWXEtZ1Q0bHlEcmRlLWpVQ1BoX3dNVnFxY2hXbw?oc=5
- [IPO챗] 니어스랩 "풍력서 검증한 AI 자율비행으로 글로벌 방산 공략" (연합뉴스, Thu, 06 Au) — https://news.google.com/rss/articles/CBMiYEFVX3lxTE1RSnhlY0xnMnR1aWRISlNkNWc1ZWgyWkN3ZEtQQU1UZnN6eUhHdEU4a2xtSkJ2ZHlvdDBhbUlRWHhjSFIwREp6aUkyWDBmT3lKcnBTSG1ybGMtTHlZWkE3Y9IBYEFVX3lxTE1RSnhlY0xnMnR1aWRISlNkNWc1ZWgyWkN3ZEtQQU1UZnN6eUhHdEU4a2xtSkJ2ZHlvdDBhbUlRWHhjSFIwREp6aUkyWDBmT3lKcnBTSG1ybGMtTHlZWkE3Yw?oc=5
- 공항에 폭발물 탑재 드론까지…독일 정부 "새로운 차원 위협"(종합) (v.daum.net, Thu, 06 Au) — https://news.google.com/rss/articles/CBMiT0FVX3lxTE14eksyOUl2RnQzUnpsdnA1aG9LQXhQa05BUEg4UWVXN2J3RkFUOUxaa1g0S1lVb2hjR3lmQnFHb2cxOGhqc1pCWXFUd3NtZms?oc=5
- 드론사업 팀 프로젝트 매니저 — 둠둠 (www.wanted.co.kr, 2026-08-07) — https://www.wanted.co.kr/wd/379169
