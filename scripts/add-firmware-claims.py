#!/usr/bin/env python3
"""PX4·ArduPilot 공식 문서 기반 '펌웨어 선택' claim(FW 계열)의 정본 + 원문 대조·반영 도구.
각 claim 의 quote 를 고정된 커밋의 공식 원문(GitHub raw)에서 내려받아 (공백 정규화 후) 글자 그대로 들어 있는지 기계적으로 대조한다. 하나라도 어긋나면 반영하지 않는다.
사용:
  python3 scripts/add-firmware-claims.py            # 원문을 내려받아 인용문 대조만 수행(파일은 바꾸지 않음)
  python3 scripts/add-firmware-claims.py --apply    # 대조 통과 시 data/ontology/claims.json 의 FW 계열을 이 정본으로 교체(멱등)
이후: build-knowledge-db.py → build-graph.py → scripts/test-fw-selection.ts.  설계·한계·확장 방법: docs/firmware-selection-claims.md
새 claim 을 추가할 때는 아래 C 목록에 (id, 주제, 속성, 값, 출처별칭, 위치, 인용문, 비고)를 넣고 필요하면 REFS(고정 커밋)·S(출처)를 갱신한다."""
import json, os, re, sys, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CLAIMS = os.path.join(ROOT, "data", "ontology", "claims.json")
CACHE = os.environ.get("FW_SOURCE_CACHE", os.path.expanduser("~/.cache/dronewiki-fw-sources"))

# 원문 고정 커밋(2026-10-31 수집). 문서는 계속 바뀌므로 인용문은 이 커밋 기준으로만 '글자 일치'가 보증된다.
REFS = {
    "PX4/PX4-Autopilot": "cf5756b06946c2e0eecb4b617f6d9e72ab535303",
    "ArduPilot/ardupilot": "fe92274205c937837e8491326ac70f3e96408d8d",
    "ArduPilot/ardupilot_wiki": "23c3dcd846a92aefe7eaf584f222d8bec91fb095",
}
# 별칭 → (저장소, 원문 경로, 공개 sourceId)
S = {
    "px_index": ("PX4/PX4-Autopilot", "docs/en/index.md", "docs.px4.io/main/en/"),
    "px_mc": ("PX4/PX4-Autopilot", "docs/en/frames_multicopter/index.md", "docs.px4.io/main/en/frames_multicopter/"),
    "px_fw": ("PX4/PX4-Autopilot", "docs/en/frames_plane/index.md", "docs.px4.io/main/en/frames_plane/"),
    "px_vtol": ("PX4/PX4-Autopilot", "docs/en/frames_vtol/index.md", "docs.px4.io/main/en/frames_vtol/"),
    "px_basic": ("PX4/PX4-Autopilot", "docs/en/getting_started/px4_basic_concepts.md", "docs.px4.io/main/en/getting_started/px4_basic_concepts"),
    "px_arch": ("PX4/PX4-Autopilot", "docs/en/concept/architecture.md", "docs.px4.io/main/en/concept/architecture"),
    "px_ros2": ("PX4/PX4-Autopilot", "docs/en/ros2/user_guide.md", "docs.px4.io/main/en/ros2/user_guide"),
    "px_readme": ("PX4/PX4-Autopilot", "README.md", "github.com/PX4/PX4-Autopilot/blob/main/README.md"),
    "ap_readme": ("ArduPilot/ardupilot", "README.md", "github.com/ArduPilot/ardupilot/blob/master/README.md"),
    "ap_copter": ("ArduPilot/ardupilot_wiki", "copter/source/docs/introduction.rst", "ardupilot.org/copter/docs/introduction.html"),
    "ap_plane": ("ArduPilot/ardupilot_wiki", "plane/source/docs/introduction.rst", "ardupilot.org/plane/docs/introduction.html"),
    "ap_quad": ("ArduPilot/ardupilot_wiki", "plane/source/docs/quadplane-overview.rst", "ardupilot.org/plane/docs/quadplane-overview.html"),
}
VERSION = {k: f"{v[0].split('/')[1]}@{REFS[v[0]][:10]}" for k, v in S.items()}


def fetch(repo, path):
    """고정 커밋의 원문을 내려받아 캐시한다(같은 커밋·경로는 다시 받지 않는다)."""
    f = os.path.join(CACHE, repo.replace("/", "__"), REFS[repo], path.replace("/", "__"))
    if not os.path.exists(f):
        os.makedirs(os.path.dirname(f), exist_ok=True)
        with urllib.request.urlopen(f"https://raw.githubusercontent.com/{repo}/{REFS[repo]}/{path}", timeout=30) as r:
            data = r.read()
        if not data: raise RuntimeError(f"빈 응답: {repo}/{path}")
        open(f, "wb").write(data)
    return open(f, encoding="utf-8", errors="replace").read()


# (id, 주제, 속성, 값(한국어 요약), 출처별칭, 위치, 인용문(원문 그대로), 비고)
C = [
 # ── PX4: 지원 기체 ──
 ("FW01", "PX4 지원 기체 유형", "지원 범위(공식 서술)", "멀티로터(multirotor)·고정익(fixed-wing)·VTOL·헬리콥터·로버 등 다양한 기체에서 동작", "px_index", "PX4 Autopilot User Guide 첫 문단", "It runs on multirotors, fixed-wing, VTOL, helicopters, rovers, and more.", ""),
 ("FW02", "PX4 멀티콥터 지원", "지원하는 멀티콥터 형상", "단일·다중 회전익: 헬리콥터·트라이콥터·쿼드콥터·헥사로터·도데카로터 등을 +·wide·x 등 다양한 기하 구조로 지원", "px_mc", "Multicopters 첫 문단", "PX4 supports numerous types of single- and multi-copters, including helicopters, tricopters, quadcopters, hexarotors, dodecarotors etc, in many different geometries (+, wide, x etc.).", ""),
 ("FW03", "PX4 고정익 지원", "지원하는 고정익 형상", "일반 비행기형·전익기(flying wing)·역V 꼬리 비행기 등 다양한 고정익 기하 구조를 지원", "px_fw", "Planes (Fixed-Wing) 첫 문단", "PX4 supports numerous plane geometries, including normal planes, flying wings, inverted V-tail planes, and so on.", ""),
 ("FW04", "PX4 VTOL 지원 유형", "지원하는 VTOL 유형 3종", "Standard VTOL·Tiltrotor·Tailsitter 3종을 주요 VTOL 유형으로 지원", "px_vtol", "VTOLs > VTOL Types", "PX4 supports the three most important/main VTOL types: [Standard VTOL](standardvtol.md), [Tiltrotor](tiltrotor.md), and [Tailsitter](tailsitter.md).", ""),
 ("FW05", "PX4 Standard VTOL 특성", "조종 난이도", "호버용·전진비행용 액추에이터가 따로 있어 VTOL 유형 중 조종이 가장 쉬움(대신 호버/전진 추진계가 분리되어 무게가 추가됨)", "px_vtol", "VTOLs > VTOL Types > Standard VTOL", "Easiest to control due to dedicated hover/forward flight actuators", "무게 추가 서술은 같은 목록의 'Additional weight from separate hover/forward flight propulsion systems'."),
 ("FW06", "PX4 Tailsitter VTOL 특성", "조종 난이도", "바람 속에서 특히 조종이 어려울 수 있음(구성은 단순·견고하나 같은 액추에이터를 호버·전진에 함께 써서 효율이 절충됨)", "px_vtol", "VTOLs > VTOL Types > Tailsitter", "Can be hard to control, particularly in wind", "단순·견고, 호버/전진 효율 절충은 같은 목록의 'Simple and robust', 'Tradeoff between efficiency in hover and forward flight'."),
 ("FW07", "PX4 Tiltrotor VTOL 특성", "조종 난이도", "로터를 90도 회전시키는 방식으로, 제어 권한이 더 커서 호버에서 테일시터보다 조종이 쉬움(대신 틸트 액추에이터가 추가되고 기구가 복잡함)", "px_vtol", "VTOLs > VTOL Types > Tiltrotor", "Easier to control in hover than tailsitters due to more control authority", "추가 액추에이터·기구 복잡성은 같은 목록의 'Additional actuators for motor tilts', 'Mechanically complex tilting mechanism'."),
 ("FW08", "PX4 VTOL 유형 간 일반 경향", "기구 복잡도와 조종성·비용", "기구가 복잡해질수록 비행은 쉬워지지만 비용과 무게가 증가함. 각 유형마다 장단점이 있고 모든 유형에 성공한 상용 사례가 있음", "px_vtol", "VTOLs > VTOL Types", "In general, as mechanical complexity increases the vehicles are easier to fly, but the cost and weight increase.", ""),
 # ── 기체 유형별 특성(PX4 공식 문서의 서술) ──
 ("FW09", "멀티콥터(기체 유형, PX4 문서 서술)", "특성", "정밀한 호버링과 수직 이착륙이 가능하나, 비행 시간이 짧고 일반적으로 더 느림", "px_basic", "Basic Concepts > Vehicle Types", "Multi-rotors offer precision hovering and vertical takeoff, at the cost of shorter and generally slower flight.", "기체 유형 자체의 특성이며 펌웨어 고유 특성이 아님."),
 ("FW10", "헬리콥터(기체 유형, PX4 문서 서술)", "특성", "멀티콥터와 비슷한 이점이 있으나 기구가 더 복잡하고 효율은 더 높음", "px_basic", "Basic Concepts > Vehicle Types", "Helicopters similar benefits to Multicopters but are mechanically more complex and more efficient.", "원문 문장 그대로(원문에 동사 누락)."),
 ("FW11", "고정익(기체 유형, PX4 문서 서술)", "장점", "멀티콥터보다 더 길고 더 빠르게 비행하므로 지상 측량 등에서 더 넓은 범위를 커버함", "px_basic", "Basic Concepts > Vehicle Types", "Fixed-wing vehicles offer longer and faster flight than multicopters, and hence better coverage for ground surveys etc.", "기체 유형 자체의 특성이며 펌웨어 고유 특성이 아님."),
 ("FW12", "고정익(기체 유형, PX4 문서 서술)", "제약", "멀티콥터보다 조종·착륙이 어렵고, 호버하거나 매우 느리게 날아야 하는 용도(예: 수직 구조물 측량)에는 부적합", "px_basic", "Basic Concepts > Vehicle Types", "However they are harder to fly and land than multicopters, and aren't suitable if you need to hover or fly very slowly", "기체 유형 자체의 특성이며 펌웨어 고유 특성이 아님."),
 ("FW13", "VTOL(기체 유형, PX4 문서 서술)", "장점", "고정익·멀티콥터의 하이브리드로, 수직 모드에서 이륙·호버한 뒤 비행기처럼 전진비행으로 전환해 두 방식의 장점을 모두 가짐", "px_basic", "Basic Concepts > Vehicle Types", "Hybrid Fixed-wing/Multicopter vehicles offer the best of both worlds", "기체 유형 자체의 특성이며 펌웨어 고유 특성이 아님."),
 ("FW14", "VTOL(기체 유형, PX4 문서 서술)", "제약", "멀티콥터나 고정익보다 대체로 비싸고, 제작과 튜닝이 더 어려움", "px_basic", "Basic Concepts > Vehicle Types", "VTOL are often more expensive than either multicopters and fixed-wing aircraft, and harder to build and tune.", "기체 유형 자체의 특성이며 펌웨어 고유 특성이 아님."),
 # ── PX4: 구조·라이선스·거버넌스·ROS 2 ──
 ("FW15", "PX4 코드 구조", "기체 간 코드 공유", "모든 PX4 기체(airframe)가 단일 코드베이스를 공유함(보트·로버·잠수정 등 다른 로봇 시스템 포함)", "px_arch", "PX4 Architectural Overview 도입부", "All PX4 [airframes](../airframes/index.md) share a single codebase (this includes other robotic systems like boats, rovers, submarines etc.).", ""),
 ("FW16", "PX4 라이선스", "라이선스", "BSD-3 라이선스(프로젝트 서술: 'Business-friendly', 상업 친화적)", "px_readme", "README > Vendor neutral governance", "Business-friendly BSD-3 license.", "BSD 3-Clause 전문은 저장소 LICENSE 파일('BSD 3-Clause License')."),
 ("FW17", "PX4 거버넌스", "운영 주체", "Linux Foundation 산하 Dronecode Foundation이 호스팅하는 중립 거버넌스", "px_readme", "README > Vendor neutral governance", "PX4 is hosted under the [Dronecode Foundation](https://www.dronecode.org/), part of the Linux Foundation.", ""),
 ("FW18", "PX4 ROS 2 연동 방식", "uORB-ROS 2 브리지 미들웨어", "uXRCE-DDS(DDS)와 Zenoh 두 가지 미들웨어를 지원", "px_ros2", "ROS 2 User Guide > Overview", "PX4 supports two middleware options for bridging uORB topics to ROS 2: [uXRCE-DDS](#dds) (DDS) and [Zenoh](#zenoh).", ""),
 ("FW19", "PX4 ROS 2 미들웨어 권장", "권장 미들웨어", "대부분의 사용자에게 DDS를 권장(더 오래되었고 PX4와 더 철저히 시험됨)", "px_ros2", "ROS 2 User Guide > Overview", "DDS is currently recommended for most users, as it is more established and has been more thoroughly tested with PX4.", ""),
 # ── ArduPilot ──
 ("FW20", "ArduPilot 지원 기체 범위", "지원 범위(공식 서술)", "전통적 비행기·쿼드플레인·멀티로터·헬리콥터에서 로버·보트·밸런스봇·잠수함까지 거의 모든 기체 시스템을 제어", "ap_readme", "README 소개", "Our autopilot software is capable of controlling almost any vehicle system imaginable, from conventional airplanes, quad planes, multi-rotors, and helicopters to rovers, boats, balance bots, and even submarines.", ""),
 ("FW21", "ArduPilot Copter(멀티콥터용)", "대상 기체", "멀티콥터용 고급 오픈소스 오토파일럿 시스템", "ap_copter", "Introducing Copter 첫 문단", "Copter is an advanced open-source autopilot system for multicopters", "문장 뒤에 헬리콥터·기타 회전익이 이어짐(FW22)."),
 ("FW22", "ArduPilot Copter(헬리콥터 지원)", "대상 기체", "전통적인 단일/이중 로터 헬리콥터와 기타 회전익 기체도 지원", "ap_copter", "Introducing Copter 첫 문단", "traditional single/dual rotor helicopters", "원문: 'multicopters, traditional single/dual rotor helicopters, and other rotor vehicles'."),
 ("FW23", "ArduPilot Plane(고정익용)", "대상 기체", "일반 비행기·전익기(flying wing)·VTOL 가능 QuadPlane용 고급 오픈소스 오토파일럿 펌웨어", "ap_plane", "Introduction to Plane 첫 문단", "Plane is an advanced open-source autopilot firmware system for conventional planes, flying wings, and VTOL capable QuadPlanes.", ""),
 ("FW24", "ArduPilot QuadPlane(VTOL 방식)", "구성 방식", "Plane 위에 구축되어 하나 이상 모터에 멀티콥터식 안정화 제어를 추가한 구조", "ap_quad", "QuadPlane Overview", "QuadPlane is built upon Plane, but adds copter like stability control for one or more motors.", ""),
 ("FW25", "ArduPilot QuadPlane 펌웨어", "펌웨어 구성", "QuadPlane 기능은 별도 펌웨어가 아니라 Plane 펌웨어 안의 옵션", "ap_quad", "QuadPlane Overview > Installing the Firmware", "QuadPlane functions are an option within the Plane firmware.", "원문 문장 전체: 'The normal instructions for installing the Plane firmware apply since QuadPlane functions are an option within the Plane firmware.'"),
 ("FW26", "ArduPilot 라이선스", "라이선스", "GNU GPL 버전 3 이상(SPDX: GPL-3.0-or-later)", "ap_readme", "README > License", "The ArduPilot project is licensed under the GNU General Public License, version 3 or (at your option) any later version (SPDX identifier `GPL-3.0-or-later`).", ""),
 ("FW27", "ArduPilot 상용 채택", "채택 현황(프로젝트 서술)", "수많은 상용 오토파일럿 시스템이 선호하는 플랫폼(프로젝트 자체 서술)", "ap_copter", "Introducing Copter 둘째 문단 이후", "ArduPilot is already a preferred platform for numerous commercially available autopilot systems", "프로젝트 자체 서술이라 독립 검증 아님."),
 ("FW28", "ArduPilot 개방성", "벤더 종속", "완전한 오픈소스이며 다양한 개발자 커뮤니티가 뒷받침함(프로젝트 서술: 'No vendor lock-in')", "ap_copter", "Introducing Copter > Key features", "ArduPilot is fully open source with a diverse community of developers behind it.", ""),
 ("FW29", "ArduPilot Copter 파라미터 유연성", "튜닝 자유도", "사용자가 동작을 제어하는 수백 개의 파라미터에 접근할 수 있음(대부분은 만질 필요 없음)", "ap_copter", "Introducing Copter > Key features", "the user has access to hundreds of parameters that control its behaviour", ""),
]

# 주 인용문 외에 value 에 반영한 보조 원문 구절(같은 출처 파일에 글자 그대로 있어야 한다 — QA 지적: 보조 인용도 자동 대조 범위에 넣는다)
EXTRA = {
    "FW05": ["Additional weight from separate hover/forward flight propulsion systems"],
    "FW06": ["Simple and robust", "Tradeoff between efficiency in hover and forward flight"],
    "FW07": ["Additional actuators for motor tilts", "Mechanically complex tilting mechanism"],
}

norm = lambda s: re.sub(r"\s+", " ", s).strip()
texts = {k: norm(fetch(v[0], v[1])) for k, v in S.items()}
bad = []
print(f"{'ID':5} {'판정':4} 출처 | 인용문(앞 70자)")
for cid, subj, attr, val, src, loc, quote, note in C:
    ok = norm(quote) in texts[src] and 0 < len(quote) <= 260
    ok = ok and all(norm(e) in texts[src] for e in EXTRA.get(cid, []))  # 보조 인용도 대조
    print(f"{cid:5} {'OK' if ok else 'FAIL':4} {src:9} | {quote[:70]}" + (f"  (+보조 {len(EXTRA[cid])}건)" if cid in EXTRA else ""))
    if not ok: bad.append(cid)
ids = [c[0] for c in C]
assert len(ids) == len(set(ids)), "ID 중복"
print(f"\n검증: {len(C) - len(bad)}/{len(C)} 일치" + (f" — 불일치: {bad}" if bad else ""))
if bad:
    sys.exit(1)
if "--apply" not in sys.argv:
    print("(검증만 수행 — 반영하려면 --apply)"); sys.exit(0)

raw = open(CLAIMS, encoding="utf-8").read()
data = json.loads(raw)
assert json.dumps(data, ensure_ascii=False, indent=2) + "\n" == raw, "기존 서식 round-trip 불일치 — 중단(파일을 건드리지 않음)"
data["claims"] = [c for c in data["claims"] if not c["id"].startswith("FW")]  # FW 계열은 매번 이 정본으로 교체
for cid, subj, attr, val, src, loc, quote, note in C:
    data["claims"].append({
        "id": cid, "rules": [], "subject": subj, "attribute": attr, "value": val, "unit": "-",
        "conditions": f"프로젝트 자체(제1자) 문서의 서술이며 독립 검증이 아님. 원문 대조: {VERSION[src]}, 2026-10-31 수집(공백 정규화 후 글자 일치).",
        "sourceType": "manufacturer", "topic": "firmware-selection", "sourceId": S[src][2], "locator": loc, "quote": quote, "status": "verified", "evidenceKind": "reported", "note": note,
    })
tag = " FW 계열(2026-10-31)은 PX4·ArduPilot 공식 저장소 원문(GitHub raw)을 내려받아 인용문이 글자 그대로 들어 있는지 기계적으로 대조(공백 정규화)한 제1자 문서 claim이다."
if tag not in data["_comment"]:
    data["_comment"] += tag
open(CLAIMS, "w", encoding="utf-8").write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
print(f"반영: FW {len(C)}건 → 총 {len(data['claims'])}건")
