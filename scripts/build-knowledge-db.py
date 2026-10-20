#!/usr/bin/env python3
"""드론 지식 RDB 생성기 — 결정론, AI 없음. Git/Markdown이 원본이고 이 DB는 항상 재생성 가능한 파생물이다.

입력
  --wiki-root     canonical Wiki 루트 (기본: 웹 발행 스냅샷 data/wiki). concepts/entities/comparisons/queries 와 ontology/class-hierarchy.json
  --ontology-dir  data/ontology (graph.json, claims.json, paper-claims.json, products-*.json, rules.json, instances.json, relations.json, manufacturer-map.json)
  --source-root   출처 경로를 실제 파일로 해석할 원본 루트 (기본: ~/2nd 가 있으면 사용). 내용은 읽지 않고 존재·해시만 기록한다.
  --papers-dir    논문 PDF 메타(candidates_*.json, pdf/) — 있으면 제목·해시 보강
출력
  --out-sql   텍스트 덤프(git 친화, 정렬·결정론). 웹은 이것을 :memory: SQLite에 적재한다.
  --out-db    (선택) 검증용 .sqlite
  --quality   (선택) 품질 리포트 JSON (/knowledge-quality 페이지용)

규칙
  * domain 은 frontmatter 값을 그대로 저장한다(없으면 NULL). 재분류·정규화·추론 금지.
  * discovery 그래프는 적재하지 않는다.
  * 위키 문장에서 만든 claim 은 최대 'sourced' (한국어 요약이라 원문 인용 일치를 확인할 수 없다).
실행: python3 scripts/build-knowledge-db.py --check
"""
import argparse, glob, hashlib, json, os, re, sqlite3, sys
from collections import Counter

try:
    import yaml
except ImportError:  # 시스템 python에 yaml이 없으면 2nd 의 venv 를 안내
    sys.exit("PyYAML 필요: ~/2nd/.venv/bin/python scripts/build-knowledge-db.py 로 실행하세요")

BUILDER_VERSION = "1"
HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "..")
LAYERS = ["concepts", "entities", "comparisons", "queries"]
sha_file_cache = {}


def sha256_bytes(b): return hashlib.sha256(b).hexdigest()
def sha1_12(s): return hashlib.sha1(s.encode("utf-8")).hexdigest()[:12]


def sha256_file(p):
    if p not in sha_file_cache:
        sha_file_cache[p] = sha256_bytes(open(p, "rb").read())
    return sha_file_cache[p]


def official_domains():
    """공식 domain 목록 = 웹 lib/types.ts DOMAIN_META 키 (2nd scripts/add-domain-tags.py DRONE_DOMAINS 와 동일 출처)."""
    t = open(os.path.join(WEB, "lib", "types.ts"), encoding="utf-8").read()
    i = t.index("DOMAIN_META")
    return set(re.findall(r'"([a-z][a-z\-]+)"\s*:\s*\{\s*label', t[i:]))


def split_frontmatter(text):
    m = re.match(r"---\n(.*?)\n---\n?", text, re.S)
    if not m: return {}, text, False
    try:
        fm = yaml.safe_load(m.group(1)) or {}
        if not isinstance(fm, dict): return {}, text[m.end():], False
        return fm, text[m.end():], True
    except Exception:
        return {}, text[m.end():], False


def s(v):
    return None if v is None else str(v)


# ── 출처 경로 해석 ──────────────────────────────────────────────────────────
def resolve_source(path, source_root):
    """inbox/X 는 처리 후 inbox/processed/X 로 이동된다. 이동을 따라가 실제 파일을 찾는다."""
    if source_root is None: return None, None
    path = re.sub(r"^\^?\[+|\]+$", "", path.strip())  # 자동 갱신이 frontmatter sources 앞에 붙인 '^[' 표기를 정규화(원본은 수정하지 않음)
    cands = [path]
    if path.startswith("inbox/") and not path.startswith("inbox/processed/"):
        cands.append("inbox/processed/" + os.path.basename(path))
    for c in cands:
        fp = os.path.join(source_root, c)
        if os.path.isfile(fp): return c, sha256_file(fp)
    return None, None


src_text_cache = {}


def source_text(path, source_root):
    """해석된 출처 파일의 본문(소문자). 위키 요약 문장의 숫자·고유어가 출처에 실제로 있는지 대조하는 용도로만 읽는다."""
    key = (source_root, path)
    if key not in src_text_cache:
        try:
            src_text_cache[key] = open(os.path.join(source_root, path), encoding="utf-8", errors="replace").read().lower()
        except OSError:
            src_text_cache[key] = ""
    return src_text_cache[key]


NUM_RE = re.compile(r"\d+(?:[.,]\d+)*")


def support_of(sentence, text):
    """문장의 숫자(연도·한 자리 정수 제외)가 출처 본문에 있는 비율. 숫자가 없으면 (None, '숫자 없음').
    번역 요약이라 문장 일치는 불가능하므로 '숫자 일치'만 결정론으로 확인한다."""
    # 슬러그·파일명 안의 번호(yolo-v8-4-182), 한국식 단위 환산(225만, 2,400만 달러 = 원문 2.25M·24M)은 문자 일치가 불가능하므로 대조 대상에서 뺀다
    cleaned = re.sub(r"[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+", " ", sentence)
    cleaned = re.sub(r"\d[\d,\.]*\s*(?:만|억|천|조)", " ", cleaned)
    nums = [n for n in NUM_RE.findall(cleaned) if not re.fullmatch(r"(19|20)\d\d", n) and not re.fullmatch(r"\d", n)]
    if not nums: return None, "숫자 없음"
    src_nums = {x.replace(",", "") for x in NUM_RE.findall(text)}
    hit = sum(1 for n in nums if n.replace(",", "") in src_nums)
    return hit / len(nums), f"숫자 {hit}/{len(nums)} 출처에 있음"


def source_type_of(path):
    if path.startswith(("http://", "https://")): return "url"
    if path.startswith("inbox/"): return "inbox"
    if path.startswith("raw/"): return "raw"
    return "other"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wiki-root", default=os.path.join(WEB, "data", "wiki"))
    ap.add_argument("--ontology-dir", default=os.path.join(WEB, "data", "ontology"))
    ap.add_argument("--source-root", default=os.path.expanduser("~/2nd"))
    ap.add_argument("--papers-dir", default=os.path.expanduser("~/projectm/hw-collection/20261019/papers-ontology"))
    ap.add_argument("--out-sql", default=os.path.join(WEB, "data", "knowledge", "knowledge.sql"))
    ap.add_argument("--out-db", default=None)
    ap.add_argument("--quality", default=os.path.join(WEB, "data", "ontology", "quality.json"))
    ap.add_argument("--check", action="store_true", help="감사 위반이 있으면 종료 코드 1")
    a = ap.parse_args()
    source_root = a.source_root if a.source_root and os.path.isdir(a.source_root) else None
    OD = a.ontology_dir
    loadj = lambda f: json.load(open(os.path.join(OD, f), encoding="utf-8")) if os.path.exists(os.path.join(OD, f)) else None

    db = sqlite3.connect(":memory:")
    db.executescript(open(os.path.join(HERE, "knowledge_db_schema.sql"), encoding="utf-8").read())
    ex = lambda q, p=(): db.execute(q, p)
    inputs = []  # (경로, 해시) → input_fingerprint

    # ═══ 1. 문서 ═══════════════════════════════════════════════════════════
    DOMAINS = official_domains()
    docs, stem_to_id, parse_fail = [], {}, 0
    for layer in LAYERS:
        for fp in sorted(glob.glob(os.path.join(a.wiki_root, layer, "*.md"))):
            rel = f"{layer}/{os.path.basename(fp)}"
            raw = open(fp, "rb").read()
            text = raw.decode("utf-8", errors="replace")
            fm, body, ok = split_frontmatter(text)
            if not ok: parse_fail += 1
            did = "doc:" + rel
            stem = os.path.splitext(os.path.basename(fp))[0]
            stem_to_id.setdefault(stem, did)
            dom = fm.get("domain") if "domain" in fm else None
            docs.append((did, rel, fm, body, sha256_bytes(raw), dom, stem))
            inputs.append((rel, sha256_bytes(raw)))
    for did, rel, fm, body, sha, dom, stem in docs:
        dstr = None if dom is None else str(dom)
        reg = None if dstr is None else int(dstr in DOMAINS)
        ex("INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
            did, rel, str(fm.get("title") or stem), str(fm.get("type") or rel.split("/")[0]), dstr, str(fm.get("status") or "active"), sha,
            s(fm.get("created")), s(fm.get("updated")), reg, None, None, s(fm.get("confidence")), int(bool(fm.get("contested"))),
            json.dumps(fm.get("contradictions") or [], ensure_ascii=False), s(fm.get("ontology_class")), body))
        tags = fm.get("tags") or []
        for t in sorted({str(x) for x in (tags if isinstance(tags, list) else [tags])}):
            ex("INSERT OR IGNORE INTO document_tags VALUES (?,?)", (did, t))
        for m in sorted(set(re.findall(r"\[\[([^\]\|#]+)(?:[|#][^\]]*)?\]\]", body))):
            tid = stem_to_id.get(m.strip())
            if tid and tid != did and ex("SELECT 1 FROM documents WHERE id=?", (tid,)).fetchone():
                ex("INSERT OR IGNORE INTO document_links VALUES (?,?,?)", (did, tid, "wikilink"))
    # 링크 대상이 나중에 적재된 문서일 수 있어 2패스로 한 번 더 보강
    for did, rel, fm, body, sha, dom, stem in docs:
        for m in sorted(set(re.findall(r"\[\[([^\]\|#]+)(?:[|#][^\]]*)?\]\]", body))):
            tid = stem_to_id.get(m.strip())
            if tid and tid != did: ex("INSERT OR IGNORE INTO document_links VALUES (?,?,?)", (did, tid, "wikilink"))

    # ═══ 2. 출처 (위키 문서가 인용한 것) ═══════════════════════════════════
    src_by_key = {}

    def add_source(document_id, key, paper_id=None, stype=None, url=None, locator=None, resolved_path=None, sha="", resolved=None, captured=None):
        sid = "src:" + sha1_12(f"{document_id}|{paper_id}|{key}")
        if sid not in src_by_key:
            ex("INSERT INTO sources VALUES (?,?,?,?,?,?,?,?,?,?,?)", (sid, document_id, paper_id, url, stype or source_type_of(key), captured, sha or "", locator, resolved_path, resolved, key))
            src_by_key[sid] = True
        return sid

    doc_src = {}  # (document_id, 원문 표기) → source id
    for did, rel, fm, body, sha, dom, stem in docs:
        srcs = fm.get("sources") or []
        for sp in (srcs if isinstance(srcs, list) else [srcs]):
            sp = str(sp).strip()
            if not sp: continue
            if sp.startswith(("http://", "https://")):
                doc_src[(did, sp)] = add_source(did, sp, stype="url", url=sp, resolved=None)
            else:
                rp, h = resolve_source(sp, source_root)
                doc_src[(did, sp)] = add_source(did, sp, resolved_path=rp, sha=h or "", resolved=(None if source_root is None else int(rp is not None)))

    # ═══ 3. 온톨로지: 클래스·노드·관계 ═════════════════════════════════════
    h = json.load(open(os.path.join(a.wiki_root, "ontology", "class-hierarchy.json"), encoding="utf-8"))["classes"]
    for name in sorted(h): ex("INSERT INTO ontology_classes VALUES (?,?)", (name, h[name].get("parent")))
    class_names = set(h)
    graph = loadj("graph.json") or {"nodes": [], "edges": []}
    inputs.append(("ontology/graph.json", sha256_file(os.path.join(OD, "graph.json")) if os.path.exists(os.path.join(OD, "graph.json")) else ""))
    nodes_by_id = {n["id"]: n for n in graph["nodes"]}
    node_ids = set()

    def add_node(nid, label, cls, domain=None, canonical=1, origin="catalog"):
        if nid in node_ids: return
        ex("INSERT INTO ontology_nodes VALUES (?,?,?,?,?,?)", (nid, label, cls, domain, canonical, origin)); node_ids.add(nid)

    for n in sorted(graph["nodes"], key=lambda x: x["id"]):
        t = n["type"]
        if t == "Manufacturer": add_node(n["id"], n["label"], "Manufacturer", origin=("registry" if n.get("inRegistry") else "catalog"))
        elif t == "Product": add_node(n["id"], n["label"], n.get("cls") or "Product", origin="catalog")
        elif t == "Rule": add_node(n["id"], n["label"], "Rule", origin="rule")
        elif t in ("Paper", "Source"): add_node(n["id"], n["label"], "Paper" if t == "Paper" else "Source", origin="paper")
    for did, rel, fm, body, sha, dom, stem in docs:
        oc = fm.get("ontology_class")
        if oc and str(oc) in class_names:
            add_node("page:" + stem, str(fm.get("title") or stem), str(oc), domain=(None if dom is None else str(dom)), origin="frontmatter")
    PROPOSE = {"Engine": ("Actuator", "연료·하이브리드 엔진/연료전지 발전기 — 공식 계층에 없음. 상위 Actuator 제안"), "Manufacturer": (None, "제조사/조직 — 공식 계층에 조직 클래스가 없음")}
    for cls, cnt in ex("SELECT class_name, count(*) FROM ontology_nodes WHERE class_name NOT IN (SELECT name FROM ontology_classes) AND class_name NOT IN ('Rule','Paper','Source','Product') GROUP BY 1 ORDER BY 1").fetchall():
        par, why = PROPOSE.get(cls, (None, "공식 계층에 없는 클래스 — 검토 필요"))
        ex("INSERT INTO ontology_class_proposals VALUES (?,?,?,?)", (cls, par, why, cnt))
    mfr_of_node = {e['s']: e['o'] for e in graph['edges'] if e['p'] == 'madeBy'}
    GENERIC_W = {'series','module','kit','brushless','motor','battery','propeller','props','frame','drone','developer','version','lipo','esc','the','and','with','for','pro','mini','flight','controller','computer','camera','sensor','lidar','radio','system'}
    # 별칭: 라벨, 제품 모델 토큰(숫자+영문 4자 이상), 제조사 등록명
    for nid in sorted(node_ids):
        n = nodes_by_id.get(nid)
        label = (n or {}).get("label") or ex("SELECT label FROM ontology_nodes WHERE id=?", (nid,)).fetchone()[0]
        als = {label.lower()}
        for tok in re.findall(r"[A-Za-z][A-Za-z0-9\-\.]*\d[A-Za-z0-9\-\.]*|\d+[A-Za-z][A-Za-z0-9\-\.]*", label):
            if len(tok) >= 4: als.add(tok.lower())
        if n and n.get("registryName"): als.add(str(n["registryName"]).lower())
        if n and n["type"] == "Product":  # 제품명에서 제조사명을 뺀 2~3단어 구(예: 'orin nx', 'mid-360') — 일반어만의 구는 제외
            mfr_label = (nodes_by_id.get(mfr_of_node.get(nid, ""), {}) or {}).get("label", "")
            nm = re.sub(r"\(.*?\)", " ", label.lower()).replace(mfr_label.lower(), " ")
            ws = re.findall(r"[a-z0-9][a-z0-9\-\.]*", nm)
            for k in (2, 3):
                for i in range(len(ws) - k + 1):
                    g = ws[i:i + k]
                    if not any(re.search(r"[a-z]", x) and x not in GENERIC_W for x in g): continue
                    if all(x in GENERIC_W or re.fullmatch(r"\d+(gb|mb|mah|s|v|a|w|kv)?", x) for x in g): continue
                    ph = " ".join(g)
                    if len(ph) >= 6: als.add(ph)
        for al in sorted(als): ex("INSERT OR IGNORE INTO ontology_aliases VALUES (?,?)", (al, nid))

    rid = 0

    def add_rel(sub, pred, obj, status, conf, source_claim=None, attrs=None):
        nonlocal rid
        rid += 1
        ex("INSERT INTO ontology_relations VALUES (?,?,?,?,?,?,?,?)", (f"rel:{rid:06d}", sub, pred, obj, source_claim, status, conf, json.dumps(attrs, ensure_ascii=False, sort_keys=True) if attrs else None))

    CONF = {"madeBy": ("derived", "high"), "isA": ("derived", "high"), "powersWith": ("derived", "high"), "packFits": ("derived", "low"), "hasCategory": ("derived", "medium"),
            "governs": ("derived", "medium"), "supports": ("verified", "high"), "mentions": ("derived", "medium"), "about": ("derived", "low"), "reportedIn": ("verified", "high")}
    for e in sorted(graph["edges"], key=lambda x: (x["s"], x["p"], x["o"])):
        st, cf = CONF.get(e["p"], ("derived", "low"))
        attrs = {k: v for k, v in e.items() if k not in ("s", "p", "o")}
        add_rel(e["s"], e["p"], e["o"], st, cf, source_claim=(e["s"][6:] if e["s"].startswith("claim:") else None), attrs=attrs or None)
    for r in (loadj("relations.json") or {}).get("relations", []):  # 클래스 간 관계: spec = 설계 기준, hw-ext = 마스터 승인 대기
        add_rel("class:" + r["domain"], r["rel"], "class:" + r["range"], "verified" if r.get("source") == "spec" else "unreviewed", "medium", attrs={"source": r.get("source"), "label": r.get("label")})

    # ═══ 4. 제품·제조사·규칙·논문 (기존 구조 보존) ═══════════════════════════
    for n in sorted(graph["nodes"], key=lambda x: x["id"]):
        if n["type"] == "Manufacturer":
            cv = n.get("countryVerified")
            ex("INSERT INTO manufacturers VALUES (?,?,?,?,?,?,?)", (n["id"], n["label"], n.get("country"), None if n.get("country") is None else int(bool(cv)), n.get("officialUrl"), int(bool(n.get("inRegistry"))), 0))
    mfr_of = {e["s"]: e["o"] for e in graph["edges"] if e["p"] == "madeBy"}
    ex("UPDATE manufacturers SET has_specs=1 WHERE id IN (%s)" % ",".join("'%s'" % m.replace("'", "''") for m in set(mfr_of.values())) if mfr_of else "SELECT 1")
    items = {p["id"]: p for p in (loadj("products-catalog.json") or {"items": []})["items"]}
    fw = {p["id"]: p for p in (loadj("products-fwvtol.json") or {"items": []})["items"]}
    for pid in sorted(mfr_of):
        mid = mfr_of[pid]
        if pid in fw:
            f = fw[pid]; nm = f.get("numeric") or {}
            ex("INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (pid, mid, f["category"], f["name"], f.get("url"), f.get("captured"), nm.get("weight_g"), nm.get("capacity_mAh"), None, nm.get("nominal_V"),
                       nm.get("continuous_A"), nm.get("peak_A"), nm.get("cells_min"), nm.get("cells_max"), ",".join(f["platform"]), json.dumps(nm, ensure_ascii=False, sort_keys=True)))
        elif pid in items:
            p = items[pid]; cells = p.get("cells") or {}; wt = p.get("weight_g")
            ex("INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (pid, mid, p["category"], p["name"], p.get("url"), p.get("captured"), wt.get("value") if isinstance(wt, dict) else wt, p.get("capacity_mAh"),
                       p.get("cells_S"), p.get("nominal_V"), p.get("continuous_A"), p.get("peak_A"), cells.get("min") if isinstance(cells, dict) else None, cells.get("max") if isinstance(cells, dict) else None, None, None))
    rules_j = loadj("rules.json") or {"rules": []}
    rules = rules_j["rules"] if isinstance(rules_j, dict) else rules_j
    for r in sorted(rules, key=lambda x: x["id"]):
        ex("INSERT INTO rules VALUES (?,?,?,?,?,?,?)", (r["id"], r["name"], r["status"], r.get("kind", "empirical"), r.get("sourceStatus"), r.get("formula"), r.get("note")))
    for e in sorted(graph["edges"], key=lambda x: (x["s"], x["p"], x["o"])):
        attrs = {k: v for k, v in e.items() if k not in ("s", "p", "o")}
        ex("INSERT OR IGNORE INTO edges VALUES (?,?,?,?)", (e["s"], e["p"], e["o"], json.dumps(attrs, ensure_ascii=False, sort_keys=True) if attrs else None))

    # ═══ 5. 논문·claim·evidence (원문 대조 claim) ═════════════════════════════
    meta = {}
    for f in sorted(glob.glob(os.path.join(a.papers_dir, "candidates_*.json"))):
        for p in json.load(open(f, encoding="utf-8")): meta[p["arxiv"]] = p
    claims_src = (loadj("claims.json") or {"claims": []})["claims"] + (loadj("paper-claims.json") or {"claims": []})["claims"]
    mention = {}
    for e in graph["edges"]:
        if e["p"] == "mentions" and e["s"].startswith("claim:"): mention.setdefault(e["s"][6:], e["o"])
    cat_hash = {k: sha256_file(os.path.join(OD, k)) for k in ("products-catalog.json", "products-fwvtol.json", "claims.json") if os.path.exists(os.path.join(OD, k))}
    for c in sorted(claims_src, key=lambda x: x["id"]):
        sid_ = c["sourceId"]
        pid = sid_.split("arXiv:")[1] if sid_.startswith("arXiv:") else None
        if pid and not ex("SELECT 1 FROM papers WHERE id=?", (pid,)).fetchone():
            m = meta.get(pid) or {}
            title = m.get("title") or (c.get("paper") or {}).get("title") or ""
            ex("INSERT INTO papers VALUES (?,?,?,?,?)", (pid, title, m.get("published") or (c.get("paper") or {}).get("published"), m.get("topic"), f"https://arxiv.org/abs/{pid}"))
            pdf = os.path.join(a.papers_dir, "pdf", f"{pid}.pdf")
            if os.path.exists(pdf):
                ex("INSERT INTO paper_files VALUES (?,?,?,?)", (pid, sha256_file(pdf), os.path.getsize(pdf), f"pdf/{pid}.pdf"))
        kind = c.get("evidenceKind") or ("derived" if c["status"] == "derived" else "reported")
        quote = (c.get("quote") or "").strip()
        has_q = bool(quote) and c["status"] == "verified"
        if has_q and kind in ("reported",): status, conf = "verified", "high"
        elif has_q and kind in ("model-assumption", "simulation"): status, conf = "verified", "medium"
        elif has_q: status, conf = "verified", "low"
        else: status, conf = "sourced", "medium"
        subj = mention.get(c["id"])
        origin = "paper" if c["sourceType"] == "paper" else ("manufacturer" if c["sourceType"] in ("manufacturer", "catalog") else "derived")
        ex("INSERT INTO claims VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
            c["id"], None, pid, subj if subj in node_ids else None, str(c.get("subject") or ""), c.get("attribute") or "reports", str(c["value"]), c.get("unit"), c.get("conditions"), None, origin, status, conf, 0, kind, c.get("topic")))
        for r in c.get("rules", []):
            if ex("SELECT 1 FROM rules WHERE id=?", (r,)).fetchone(): ex("INSERT OR IGNORE INTO claim_rules VALUES (?,?)", (c["id"], r))
        if pid:
            src = add_source(None, f"paper:{pid}", paper_id=pid, stype="paper", url=f"https://arxiv.org/abs/{pid}", locator=c.get("locator"),
                             sha=(ex("SELECT sha256 FROM paper_files WHERE paper_id=?", (pid,)).fetchone() or [""])[0], resolved=(1 if ex("SELECT 1 FROM paper_files WHERE paper_id=?", (pid,)).fetchone() else None))
        else:
            src = add_source(None, f"derived:{sid_}", stype=("catalog" if origin == "manufacturer" else "derived"), locator=c.get("locator"), sha=cat_hash.get("products-catalog.json", ""), resolved=1)
        ex("INSERT INTO evidence (id,claim_id,source_id,locator,quote,evidence_type,verified,verification_method) VALUES (?,?,?,?,?,?,?,?)", (
            "ev:" + sha1_12(c["id"]), c["id"], src, c.get("locator"), quote or str(c["value"]), "verbatim-quote" if has_q else "derived-calc", int(has_q), "pdf-quote-match" if has_q else "derived-calc"))
    # 규칙 쪽에서 지정한 근거(rules.json claims 목록)도 claim_rules 에 반영
    for r in rules:
        for cid in r.get("claims", []):
            if ex("SELECT 1 FROM claims WHERE id=?", (cid,)).fetchone(): ex("INSERT OR IGNORE INTO claim_rules VALUES (?,?)", (cid, r["id"]))

    # ═══ 6. 위키 문장 claim (^[출처] 마커) — 최대 sourced ═════════════════════
    MARK = re.compile(r"\^\[([^\]]+)\]")
    for did, rel, fm, body, sha, dom, stem in docs:
        dconf = str(fm.get("confidence") or "low")
        dcont = int(bool(fm.get("contested")))
        for line in body.split("\n"):
            for m in MARK.finditer(line):
                before = line[:m.start()].rstrip()
                core = before
                cut = max(core[:-1].rfind(". "), core[:-1].rfind("다. "), core[:-1].rfind("? "), core[:-1].rfind("! "))
                sent = core[cut + 2:] if cut >= 0 else core
                sent = re.sub(r"\[\[([^\]\|]+)(?:\|[^\]]*)?\]\]", r"\1", sent)
                sent = re.sub(r"^[\s>\-\*#\d\.\)\|]+", "", sent).strip()
                sent = re.sub(r"\s+", " ", sent)
                if len(sent) < 12: continue
                sent = sent[-400:]
                cid = "W:" + sha1_12(f"{did}|{sent}")
                paths = [x.strip() for x in re.split(r"[;,]", m.group(1)) if x.strip()]
                sids = []
                for pth in paths:
                    key = (did, pth)
                    if key not in doc_src:
                        if pth.startswith(("http://", "https://")): doc_src[key] = add_source(did, pth, stype="url", url=pth)
                        else:
                            rp, hh = resolve_source(pth, source_root)
                            doc_src[key] = add_source(did, pth, resolved_path=rp, sha=hh or "", resolved=(None if source_root is None else int(rp is not None)))
                    sids.append(doc_src[key])
                if ex("SELECT 1 FROM claims WHERE id=?", (cid,)).fetchone(): continue
                resolved_any = any(ex("SELECT resolved FROM sources WHERE id=?", (x,)).fetchone()[0] == 1 for x in sids)
                unknown_any = any(ex("SELECT resolved FROM sources WHERE id=?", (x,)).fetchone()[0] is None and not ex("SELECT source_type FROM sources WHERE id=?", (x,)).fetchone()[0] == "url" for x in sids)
                status = "sourced" if resolved_any else ("unverified" if unknown_any else "blocked")
                # 숫자 지지도: 문장 속 숫자가 인용 출처에 있는지(가장 잘 맞는 출처 기준). 숫자가 하나도 출처에 없으면 확인 불가로 내린다.
                supports = {}
                for sid in sids:
                    rpath = ex("SELECT raw_path FROM sources WHERE id=? AND resolved=1", (sid,)).fetchone()
                    if rpath and rpath[0] and source_root: supports[sid] = support_of(sent, source_text(rpath[0], source_root))
                scored = [v for v in (x[0] for x in supports.values()) if v is not None]
                best = max(scored) if scored else None
                if status == "sourced" and best is not None and best == 0: status = "unverified"
                if dcont: status = "contested"
                conf = {"high": "high", "medium": "medium"}.get(dconf, "low")
                if status in ("blocked", "unverified") or (best is not None and best < 1): conf = "low"
                ex("INSERT INTO claims VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                    cid, did, None, ("page:" + stem) if ("page:" + stem) in node_ids else None, str(fm.get("title") or stem), "states", sent, None, None, (None if dom is None else str(dom)), "wiki", status, conf, dcont, "wiki-summary", None))
                for k, sid in enumerate(sids):
                    sv = supports.get(sid, (None, "확인 불가"))
                    ex("INSERT OR IGNORE INTO evidence (id,claim_id,source_id,locator,quote,evidence_type,verified,verification_method,support_score,support_detail) VALUES (?,?,?,?,?,?,?,?,?,?)", ("ev:" + sha1_12(f"{cid}|{sid}"), cid, sid, None, sent, "wiki-summary", 0, "source-file-hash" if ex("SELECT resolved FROM sources WHERE id=?", (sid,)).fetchone()[0] == 1 else "unresolved", sv[0], sv[1]))

    # ═══ 7. 질의 후보 (ontology 노드에서 결정론 생성) ═══════════════════════
    TPL = {"Motor": ["{l}에 맞는 ESC는?", "{l}의 제조사와 사양은?"], "ESC": ["{l}과 함께 쓸 수 있는 모터는?"], "Battery": ["{l}과 호환되는 부품은?"], "Manufacturer": ["{l}의 제품은 무엇이 있어?"],
           "Rule": ["{l}의 근거는 무엇이야?"], "Engine": ["{l}의 사양은?"], "Frame": ["{l}의 사양은?"], "Propeller": ["{l}의 사양은?"]}
    for nid, label, cls in ex("SELECT id,label,class_name FROM ontology_nodes ORDER BY id").fetchall():
        for k, t in enumerate(TPL.get(cls, [])):
            ex("INSERT OR IGNORE INTO query_candidates VALUES (?,?,?,?)", (f"qc:{sha1_12(nid + str(k))}", nid, t, t.format(l=label[:60])))

    # ═══ 8. FTS 채우기 + meta ═════════════════════════════════════════════
    ex("INSERT INTO document_fts SELECT d.id, coalesce(d.domain,''), d.title, d.body, coalesce((SELECT group_concat(tag,' ') FROM (SELECT tag FROM document_tags t WHERE t.document_id=d.id ORDER BY tag)),'') FROM documents d ORDER BY d.id")
    ex("INSERT INTO claim_fts SELECT id, coalesce(subject_text,''), predicate, object_value, coalesce(conditions,'') FROM claims ORDER BY id")
    inputs += [(f"ontology/{k}", v) for k, v in sorted(cat_hash.items())]
    fp = sha256_bytes("\n".join(f"{p}:{h}" for p, h in sorted(inputs)).encode())
    counts = {t: ex(f"SELECT count(*) FROM {t}").fetchone()[0] for t in ("documents", "sources", "ontology_nodes", "ontology_relations", "claims", "evidence", "products", "manufacturers")}
    for k, v in sorted({"schema_version": "1", "builder_version": BUILDER_VERSION, "input_fingerprint": fp, "source_root_used": str(source_root is not None), **{f"count_{c}": str(n) for c, n in counts.items()}}.items()):
        ex("INSERT INTO meta VALUES (?,?)", (k, v))
    db.commit()

    # ═══ 9. 감사 ═══════════════════════════════════════════════════════════
    audit, bad = run_audit(db)
    warns = run_warnings(db, DOMAINS)
    for d in audit: print(("  ✅ " if d["ok"] else "  ❌ ") + d["desc"] + ("" if d["ok"] else f" → {d['count']}건: {d['sample'][:5]}"))
    for d in warns: print(("  ✅ " if d["ok"] else "  ⚠ ") + d["desc"] + ("" if d["ok"] else f" → {d['count']}건: {d['sample'][:5]}"))
    print("집계:", counts, "· frontmatter 파싱 실패:", parse_fail)

    # ═══ 10. 출력 ═════════════════════════════════════════════════════════
    os.makedirs(os.path.dirname(a.out_sql), exist_ok=True)
    write_dump(db, a.out_sql)
    print(f"덤프: {a.out_sql} ({os.path.getsize(a.out_sql) // 1024} KB) fingerprint={fp[:12]}")
    if a.out_db:
        if os.path.exists(a.out_db): os.remove(a.out_db)
        disk = sqlite3.connect(a.out_db); db.backup(disk); disk.close()
    if a.quality: write_quality(db, audit, warns, a.quality)
    return 1 if (bad and a.check) else 0


# ── 감사 쿼리 ──────────────────────────────────────────────────────────────
def run_audit(db):
    q = lambda s: [r[0] for r in db.execute(s).fetchall()]
    res, bad = [], 0
    fk = db.execute("PRAGMA foreign_key_check").fetchall()
    res.append({"desc": "외래키 위반", "ok": not fk, "count": len(fk), "sample": [str(x) for x in fk[:5]]}); bad += len(fk)
    checks = [
        ("verified claim인데 인용문이 비어 있음", "SELECT c.id FROM claims c LEFT JOIN evidence e ON e.claim_id=c.id WHERE c.status='verified' AND (e.id IS NULL OR e.verified=0 OR length(e.quote)<15)"),
        ("evidence 없는 claim", "SELECT c.id FROM claims c LEFT JOIN evidence e ON e.claim_id=c.id WHERE e.id IS NULL"),
        ("조건(conditions)이 비어 있는 논문 claim", "SELECT id FROM claims WHERE origin='paper' AND (conditions IS NULL OR trim(conditions)='')"),
        ("관계의 주어/목적어가 노드·클래스에 없음", "SELECT r.id FROM ontology_relations r WHERE NOT (r.subject_id IN (SELECT id FROM ontology_nodes) OR (r.subject_id LIKE 'class:%' AND (substr(r.subject_id,7) IN (SELECT name FROM ontology_classes) OR substr(r.subject_id,7) IN (SELECT name FROM ontology_class_proposals))) OR r.subject_id LIKE 'claim:%') OR NOT (r.object_id IN (SELECT id FROM ontology_nodes) OR (r.object_id LIKE 'class:%' AND (substr(r.object_id,7) IN (SELECT name FROM ontology_classes) OR substr(r.object_id,7) IN (SELECT name FROM ontology_class_proposals))) OR r.object_id LIKE 'claim:%')"),
        ("노드 클래스가 온톨로지 클래스에 없음(제조사·제품·규칙·논문 제외)", "SELECT id FROM ontology_nodes WHERE class_name NOT IN (SELECT name FROM ontology_classes) AND class_name NOT IN ('Manufacturer','Product','Rule','Paper','Source','Motor','ESC','Propeller','Battery','Frame','FlightController','CompanionComputer','Datalink','Sensor','Payload','Engine')"),
        ("domain이 있는데 문자열이 비어 있음", "SELECT id FROM documents WHERE domain IS NOT NULL AND trim(domain)=''"),
        ("구현된 실측 상수 규칙(empirical)인데 근거 claim 없음", "SELECT r.id FROM rules r LEFT JOIN claim_rules cr ON cr.rule_id=r.id WHERE r.status='implemented' AND r.kind='empirical' AND cr.rule_id IS NULL"),
        ("제품 제조사 누락", "SELECT p.id FROM products p LEFT JOIN manufacturers m ON m.id=p.manufacturer_id WHERE m.id IS NULL"),
        ("ESC 연속전류가 피크전류보다 큼", "SELECT id FROM products WHERE category='esc' AND continuous_a IS NOT NULL AND peak_a IS NOT NULL AND continuous_a>peak_a"),
        ("모델 가정·시뮬레이션 값만으로 'verified' 판정된 규칙", "SELECT r.id FROM rules r WHERE r.source_status='verified' AND NOT EXISTS (SELECT 1 FROM claim_rules cr JOIN claims c ON c.id=cr.claim_id WHERE cr.rule_id=r.id AND c.evidence_kind IN ('reported','derived'))"),
    ]
    for desc, sql in checks:
        rows = q(sql); res.append({"desc": desc, "ok": not rows, "count": len(rows), "sample": rows[:8]}); bad += len(rows)
    return res, bad


def run_warnings(db, DOMAINS):
    q = lambda s: [r[0] for r in db.execute(s).fetchall()]
    W = [
        ("경험칙(heuristic) 규칙인데 근거 claim 없음", "SELECT r.id FROM rules r LEFT JOIN claim_rules cr ON cr.rule_id=r.id WHERE r.status='implemented' AND r.kind='heuristic' AND cr.rule_id IS NULL"),
        ("추진·배터리·구조·사이징 주제인데 규칙에 연결되지 않은 논문 claim", "SELECT c.id FROM claims c LEFT JOIN claim_rules r ON r.claim_id=c.id WHERE r.claim_id IS NULL AND c.origin='paper' AND c.topic IN ('propulsion','battery','energy','structure','forward-flight','sizing')"),
        ("공식 목록에 없는 domain 값을 가진 문서(값은 보존)", "SELECT path FROM documents WHERE domain_registered=0"),
        ("domain이 없는 문서(추론하지 않고 NULL 유지)", "SELECT path FROM documents WHERE domain IS NULL"),
        ("해석되지 않은 출처 경로(blocked claim 원인)", "SELECT ref FROM sources WHERE resolved=0 AND source_type IN ('inbox','raw','other') ORDER BY ref"),
        ("frontmatter sources 표기 결함('^[' 접두, 원본 데이터 문제 — 해석기가 정규화해 해소)", "SELECT ref FROM sources WHERE document_id IS NOT NULL AND ref LIKE '^[%'"),
        ("ontology_class 가 있는 canonical 문서가 전체의 10% 미만", "SELECT 'coverage' WHERE (SELECT count(*) FROM documents WHERE ontology_class IS NOT NULL)*10 < (SELECT count(*) FROM documents)"),
    ]
    return [{"desc": d, "ok": not (rows := q(s)), "count": len(rows), "sample": rows[:6]} for d, s in W]


# ── 덤프(텍스트, 정렬, 결정론) ──────────────────────────────────────────────
def lit(v):
    if v is None: return "NULL"
    if isinstance(v, (int, float)): return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def write_dump(db, path):
    order = ["meta", "documents", "document_tags", "document_links", "papers", "paper_files", "sources", "ontology_classes", "ontology_nodes", "ontology_class_proposals", "ontology_aliases", "ontology_relations",
             "manufacturers", "products", "rules", "edges", "claims", "claim_rules", "evidence", "query_candidates"]
    schema = open(os.path.join(HERE, "knowledge_db_schema.sql"), encoding="utf-8").read()
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("-- knowledge.sql: build-knowledge-db.py 결정론 덤프 (수정 금지, 재생성하세요)\n")
        f.write(schema.rstrip() + "\n\nBEGIN;\n")
        for t in order:
            cols = [r[1] for r in db.execute(f"PRAGMA table_info({t})")]
            pk = [r[1] for r in sorted(db.execute(f"PRAGMA table_info({t})"), key=lambda r: r[5]) if r[5] > 0] or cols
            for row in db.execute(f"SELECT * FROM {t} ORDER BY {','.join(pk)}"):
                f.write(f"INSERT INTO {t} ({','.join(cols)}) VALUES ({','.join(lit(v) for v in row)});\n")
        f.write("INSERT INTO document_fts SELECT d.id, coalesce(d.domain,''), d.title, d.body, coalesce((SELECT group_concat(tag,' ') FROM (SELECT tag FROM document_tags t WHERE t.document_id=d.id ORDER BY tag)),'') FROM documents d ORDER BY d.id;\n")
        f.write("INSERT INTO claim_fts SELECT id, coalesce(subject_text,''), predicate, object_value, coalesce(conditions,'') FROM claims ORDER BY id;\n")
        f.write("COMMIT;\nPRAGMA foreign_keys = ON;\n")


def write_quality(db, audit, warns, path):
    q = lambda s: db.execute(s).fetchall(); one = lambda s: db.execute(s).fetchone()[0]
    rules = []
    for r in q("SELECT id,name,status,kind,source_status,formula FROM rules ORDER BY id"):
        k = dict(q(f"SELECT c.evidence_kind, count(*) FROM claim_rules cr JOIN claims c ON c.id=cr.claim_id WHERE cr.rule_id='{r[0]}' GROUP BY 1"))
        papers = one(f"SELECT count(DISTINCT c.paper_id) FROM claim_rules cr JOIN claims c ON c.id=cr.claim_id WHERE cr.rule_id='{r[0]}' AND c.paper_id IS NOT NULL")
        rules.append({"id": r[0], "name": r[1], "status": r[2], "kind": r[3], "sourceStatus": r[4], "formula": r[5], "claims": sum(k.values()), "byKind": k, "papers": papers})
    out = {
        "generated": __import__("datetime").date.today().isoformat(),
        "fingerprint": one("SELECT value FROM meta WHERE key='input_fingerprint'")[:12],
        "counts": {"manufacturers": one("SELECT count(*) FROM manufacturers"), "products": one("SELECT count(*) FROM products"), "rules": one("SELECT count(*) FROM rules"),
                   "papers": one("SELECT count(*) FROM papers"), "claims": one("SELECT count(*) FROM claims WHERE origin!='wiki'"), "edges": one("SELECT count(*) FROM edges"),
                   "documents": one("SELECT count(*) FROM documents"), "wikiClaims": one("SELECT count(*) FROM claims WHERE origin='wiki'"), "relations": one("SELECT count(*) FROM ontology_relations")},
        "claimsByKind": dict(q("SELECT evidence_kind, count(*) FROM claims WHERE origin!='wiki' GROUP BY 1")),
        "claimsByTopic": dict(q("SELECT coalesce(topic,'-'), count(*) FROM claims WHERE origin!='wiki' GROUP BY 1 ORDER BY 2 DESC")),
        "claimsByStatus": dict(q("SELECT origin||':'||status, count(*) FROM claims GROUP BY 1 ORDER BY 1")),
        "productsByCategory": dict(q("SELECT category, count(*) FROM products GROUP BY 1 ORDER BY 2 DESC")),
        "manufacturers": {"withSpecs": one("SELECT count(*) FROM manufacturers WHERE has_specs=1"), "registryOnly": one("SELECT count(*) FROM manufacturers WHERE has_specs=0"),
                          "countryVerified": one("SELECT count(*) FROM manufacturers WHERE country_verified=1"), "countryUnverified": one("SELECT count(*) FROM manufacturers WHERE country_verified=0"),
                          "countryUnknown": one("SELECT count(*) FROM manufacturers WHERE country_verified IS NULL")},
        "documents": {"total": one("SELECT count(*) FROM documents"), "withDomain": one("SELECT count(*) FROM documents WHERE domain IS NOT NULL"), "noDomain": one("SELECT count(*) FROM documents WHERE domain IS NULL"),
                      "unregisteredDomain": one("SELECT count(*) FROM documents WHERE domain_registered=0"), "withOntologyClass": one("SELECT count(*) FROM documents WHERE ontology_class IS NOT NULL"),
                      "byDomain": dict(q("SELECT coalesce(domain,'(없음)'), count(*) FROM documents GROUP BY 1 ORDER BY 2 DESC"))},
        "sources": {"total": one("SELECT count(*) FROM sources WHERE document_id IS NOT NULL"), "resolved": one("SELECT count(*) FROM sources WHERE document_id IS NOT NULL AND resolved=1"),
                    "unresolved": one("SELECT count(*) FROM sources WHERE document_id IS NOT NULL AND resolved=0"), "unknown": one("SELECT count(*) FROM sources WHERE document_id IS NOT NULL AND resolved IS NULL")},
        "edgesByRelation": dict(q("SELECT p, count(*) FROM edges GROUP BY 1 ORDER BY 2 DESC")),
        "rules": rules, "audit": audit, "warnings": warns,
    }
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    sys.exit(main())
