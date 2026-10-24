#!/usr/bin/env python3
"""초록 인용 claim 추출(2026-10-24): 모델 제안 → 코드가 raw 논문 초록과 인용문 글자 일치·값 존재 확인 → 별도 판정 호출. 결과 full-result.json 후처리(같은 인용문·속성 중복 제거, 한정어 표기) 후 data/ontology/auto-claims.json. 사용: python3 scripts/extract-abstract-claims.py all"""
import json,re,os,sys,glob,random,urllib.request
W=os.path.expanduser('~/2nd'); H=os.path.expanduser('~/projectm/drone-wiki-web')
key=[l.split('=',1)[1].strip().strip('"\'').split(',')[0] for l in open(f'{H}/.env.local') if l.startswith('NVIDIA_NIM_API_KEY=')][0]
done={c['sourceId'] for c in json.load(open(f'{H}/data/ontology/paper-claims.json'))['claims']}
done|={c['sourceId'] for c in json.load(open(f'{H}/data/ontology/claims.json'))['claims'] if 'sourceId' in c}
def meta(t):
    fm=t.split('\n---',1)[0]; g=lambda k:(re.search(rf'^{k}:\s*"?(.*?)"?\s*$',fm,re.M) or [None,''])[1]
    return g('title'),g('doi'),g('url')
cands=[]
for f in sorted(glob.glob(f'{W}/raw/papers/**/*.md',recursive=True)):
    if '/files/' in f: continue
    t=open(f,errors='ignore').read(); title,doi,url=meta(t)
    m=re.search(r'arxiv\.org/abs/(\d{4}\.\d{4,5})',url); aid='arXiv:'+m.group(1) if m else None
    if not aid or aid in done: continue
    body=t.split('\n---',2)[-1] if t.startswith('---') else t
    ab=re.search(r'## Abstract\s*\n+(.+?)(\n## |\Z)',body,re.S)
    if not ab or len(ab.group(1))<700: continue
    if not re.search(r'\d',ab.group(1)): continue
    cands.append((f,aid,title,ab.group(1).strip()))
sample=cands if len(sys.argv)<2 or sys.argv[1]=='all' else cands[:int(sys.argv[1])]
norm=lambda s:re.sub(r'\s+',' ',s.replace(' ',' ')).strip()
PROMPT="""아래 논문 초록에서 **수치가 들어 있는 사실 주장**만 뽑아 JSON 배열로만 답하라. 각 항목: {"subject":대상,"attribute":속성,"value":숫자 문자열,"unit":단위,"conditions":조건,"quote":초록에서 **글자 그대로 복사한 문장 일부(15자 이상)**}. 초록에 없는 수치는 만들지 말고, 수치가 없으면 []. 설명 금지."""
JUDGE="너는 엄격한 검수자다. 인용문과 주장을 보고, 인용문이 그 대상의 그 속성이 그 값이라고 **직접·유일하게** 말하고 있고 연구 결과·사양(배경·동기·일반론 아님)일 때만 OK, 아니면 NO 한 단어로만 답하라. 인용문에 비슷한 수치가 여러 개라 어느 것인지 모호하면 NO."
def judge(c,q):
    body=json.dumps({"model":"nvidia/nemotron-3-ultra-550b-a55b","messages":[{"role":"system","content":JUDGE},{"role":"user","content":f"인용문: {q}\n대상: {c.get('subject')}\n속성: {c.get('attribute')}\n값: {c.get('value')} {c.get('unit','')}"}],"temperature":0,"max_tokens":8,"chat_template_kwargs":{"enable_thinking":False}}).encode()
    r=urllib.request.Request('https://integrate.api.nvidia.com/v1/chat/completions',body,{"Authorization":"Bearer "+key,"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(r,timeout=60))['choices'][0]['message']['content'].strip().upper().startswith('OK')
def call(ab):
    body=json.dumps({"model":"nvidia/nemotron-3-ultra-550b-a55b","messages":[{"role":"system","content":PROMPT},{"role":"user","content":ab}],"temperature":0,"max_tokens":1500,"chat_template_kwargs":{"enable_thinking":False}}).encode()
    r=urllib.request.Request('https://integrate.api.nvidia.com/v1/chat/completions',body,{"Authorization":"Bearer "+key,"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(r,timeout=120))['choices'][0]['message']['content']
out=[];stat={'제안':0,'통과':0,'인용불일치':0,'값불일치':0,'파싱실패':0,'판정거절':0}
for f,aid,title,ab in sample:
    try:
        raw=call(ab); arr=json.loads(re.search(r'\[.*\]',raw,re.S).group(0))
    except Exception as e: stat['파싱실패']+=1; print('파싱실패',aid,type(e).__name__,flush=True); continue
    nab=norm(ab)
    for i,c in enumerate(arr,1):
        stat['제안']+=1
        q=norm(str(c.get('quote','')))
        if len(q)<15 or q not in nab: stat['인용불일치']+=1; continue
        v=str(c.get('value','')).replace(',','')
        if not v or v.replace('.','',1).lstrip('-').isdigit()==False or v not in q.replace(',',''): stat['값불일치']+=1; continue
        try: okj=judge(c,q)
        except Exception: okj=False
        if not okj: stat['판정거절']+=1; continue
        stat['통과']+=1
        out.append({"id":f"{aid.split(':')[1]}-A{i:02d}","subject":c.get('subject'),"attribute":c.get('attribute'),"value":v,"unit":c.get('unit',''),"conditions":c.get('conditions',''),"sourceType":"paper","sourceId":aid,"locator":"Abstract","quote":q,"status":"sourced","verification":"quote-literal-match(abstract)+value-in-quote+judge-pass(해석 미검증)","evidenceKind":"reported","paper":{"title":title}})
json.dump({"stat":stat,"claims":out},open(os.path.dirname(os.path.abspath(__file__))+'/full-result.json','w'),ensure_ascii=False,indent=1)
print(stat,'논문',len(sample),'후보 풀',len(cands))
