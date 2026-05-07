import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'

const TC = { g: ['#d1fae5','#065f46'], a: ['#fef3c7','#92400e'], r: ['#fee2e2','#991b1b'], b: ['#ede9fe','#5b21b6'] }

function gCls(key, val) {
  const neg = ['위험','불안정','축소','하락','약함','악화','주의']
  const pos = ['안정','건강','확대','상승','강함','확장','낮음']
  if (key === 'risk' || key === 'financial') {
    if (val.includes('낮음')) return 'pos'
    if (val.includes('높음')) return 'neg'
  }
  if (neg.some(t => val.includes(t))) return 'neg'
  if (pos.some(t => val.includes(t))) return 'pos'
  return 'neu'
}

const G1 = [
  { key:'financial', label:'재정 이상 징후' },
  { key:'org',       label:'조직 안정성' },
  { key:'ma',        label:'투자 / M&A 신호' },
  { key:'hiring',    label:'채용 활동' },
]
const G2 = [
  { key:'newgame',   label:'신작 성과' },
  { key:'live',      label:'라이브 건강도' },
  { key:'media',     label:'대외 화제성' },
  { key:'portfolio', label:'포트폴리오 전략' },
  { key:'hitscore',  label:'신작 흥행력' },
  { key:'market',    label:'시장 경쟁력' },
]
const DC = [
  { key:'news',    title:'뉴스 / 기사',      badge:'news' },
  { key:'finance', title:'재무 동향',        badge:'fin' },
  { key:'people',  title:'인력 / 조직',      badge:'ppl' },
  { key:'hiring',  title:'채용 트렌드',      badge:'hire' },
  { key:'market',  title:'시장 경쟁력 분석', badge:'market' },
  { key:'signal',  title:'소싱 시그널',      badge:'sig' },
]

function GaugeCard({ item, gauge, highlight }) {
  const g = (gauge && gauge[item.key]) || { val: '-', reason: '', pct: 50 }
  const c = gCls(item.key, g.val)
  return (
    <div style={{ background:'#fff', border:`0.5px solid ${highlight ? '#6366f1' : '#e5e7eb'}`, borderRadius:12, padding:'10px 12px', background: highlight ? '#f5f3ff' : '#fff' }}>
      <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em', color:'#6b7280', marginBottom:5, lineHeight:1.3 }}>{item.label}</p>
      <p style={{ fontSize:13, fontWeight:800, marginBottom:5, color: c==='pos'?'#059669':c==='neg'?'#dc2626':'#6b7280' }}>{g.val}</p>
      <div style={{ height:3, background:'#e5e7eb', borderRadius:2, overflow:'hidden', marginBottom:5 }}>
        <div style={{ height:'100%', width:`${g.pct||50}%`, background: c==='pos'?'#10b981':c==='neg'?'#ef4444':'#9ca3af', borderRadius:2 }} />
      </div>
      <p style={{ fontSize:10, color:'#9ca3af', lineHeight:1.35 }}>{g.reason}</p>
    </div>
  )
}

function GaugeGroup({ label, items, gauge }) {
  return (
    <div style={{ marginBottom:16 }}>
      <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.12em', color:'#9ca3af', marginBottom:8 }}>{label}</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
        {items.map(item => <GaugeCard key={item.key} item={item} gauge={gauge} highlight={false} />)}
      </div>
    </div>
  )
}

export default function Home() {
  const [view, setView] = useState('landing') // landing | result
  const [query, setQuery] = useState('')
  const [headerQuery, setHeaderQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState(null)
  const [saved, setSaved] = useState(false)
  const [history, setHistory] = useState([])
  const [companies, setCompanies] = useState([])
  const [banner, setBanner] = useState(null) // {ok, msg}
  const [showTrend, setShowTrend] = useState(false)
  const [isUnlisted, setIsUnlisted] = useState(false)
  const [communityQuotaExceeded, setCommunityQuotaExceeded] = useState(false)
  const [communityExtended, setCommunityExtended] = useState(false)
  const [dataDates, setDataDates] = useState({})
  const [showUnlistedModal, setShowUnlistedModal] = useState(false)
  const [pendingCompany, setPendingCompany] = useState('')
  const [manualInput, setManualInput] = useState('')
  const [manualFiles, setManualFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const trendRef = useRef(null)

  useEffect(() => {
    loadHistory()
    if (banner) {
      const t = setTimeout(() => setBanner(null), 4000)
      return () => clearTimeout(t)
    }
  }, [banner])

  async function loadHistory() {
    try {
      const res = await fetch('/api/history')
      const data = await res.json()
      const rows = data.rows || []
      const parsed = rows.map(r => ({
        timestamp: r[0]||'', company: r[1]||'', summary: r[2]||'',
        summary_points: r[3] ? JSON.parse(r[3]) : [],
        summary_tags:   r[4] ? JSON.parse(r[4]) : [],
        news:    r[5]  ? JSON.parse(r[5])  : [],
        finance: r[6]  ? JSON.parse(r[6])  : [],
        people:  r[7]  ? JSON.parse(r[7])  : [],
        hiring:  r[8]  ? JSON.parse(r[8])  : [],
        signal:  r[9]  ? JSON.parse(r[9])  : [],
        signal_tags: r[10] ? JSON.parse(r[10]) : [],
        gauge:   r[11] ? JSON.parse(r[11]) : {},
        alert_level: r[12]||'normal',
      }))
      setHistory(parsed)
      const seen = new Set()
      const comps = parsed.map(r => r.company).filter(c => { if (seen.has(c)) return false; seen.add(c); return true }).reverse()
      setCompanies(comps)
    } catch {}
  }

  async function run(name, manualData = null) {
    if (!name?.trim()) return
    const n = name.trim()
    setQuery(n)
    setHeaderQuery(n)
    setSaved(false)
    setShowTrend(false)
    setShowUnlistedModal(false)
    setManualInput('')
    setManualFiles([])

    // 비상장 여부 사전 체크 (수동입력 없을 때만)
    if (!manualData) {
      try {
        setStatus(n + ' 기업 정보 확인 중...')
        const chk = await fetch('/api/check-listed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company: n }),
        })
        const chkData = await chk.json()
        if (chkData.is_unlisted) {
          setPendingCompany(n)
          setShowUnlistedModal(true)
          setStatus('')
          return
        }
      } catch {}
    }

    await doAnalyze(n, manualData)
  }

  async function doAnalyze(n, manualData = null) {
    setView('result')
    setLoading(true)
    setProgress(15)
    setStatus(n + ' 분석 중...')
    setResult(null)
    try {
      setProgress(40)
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: n, manualData }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '분석 실패')
      setProgress(90)
      const r = { ...data, timestamp: new Date().toLocaleString('ko-KR'), company: n }
      setResult(r)
      setIsUnlisted(r._meta?.is_unlisted || false)
      setCommunityQuotaExceeded(r._meta?.community_quota_exceeded || false)
      setCommunityExtended(r._meta?.community_period_extended || false)
      setDataDates(r._meta?.data_dates || {})
      setCompanies(prev => prev.includes(n) ? prev : [n, ...prev])
      setStatus('')
    } catch (e) {
      setStatus('분석 실패: ' + e.message)
    }
    setProgress(0)
    setLoading(false)
  }

  async function save() {
    if (!result || saved) return
    try {
      const r = result
      const row = [
        r.timestamp, r.company, r.summary||'',
        JSON.stringify(r.summary_points||[]), JSON.stringify(r.summary_tags||[]),
        JSON.stringify(r.news||[]), JSON.stringify(r.finance||[]),
        JSON.stringify(r.people||[]), JSON.stringify(r.hiring||[]),
        JSON.stringify(r.signal||[]), JSON.stringify(r.signal_tags||[]),
        JSON.stringify(r.gauge||{}), r.alert_level||'normal',
      ]
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSaved(true)
      setHistory(prev => [r, ...prev])
      setCompanies(prev => prev.includes(r.company) ? prev : [r.company, ...prev])
      setBanner({ ok: true, msg: `'${r.company}' 저장 완료` })
    } catch (e) {
      setBanner({ ok: false, msg: '저장 실패: ' + e.message })
    }
  }

  const risk = result?.gauge?.risk?.val || '보통'
  const riskClass = risk === '낮음' ? 'low' : risk === '높음' ? 'high' : 'mid'

  return (
    <>
      <Head>
        <title>게임사 인텔리전스</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #fff; color: #0f172a; }
        input { font-family: 'Inter', sans-serif; }
        button { font-family: 'Inter', sans-serif; cursor: pointer; }
        .h-pill { font-size:10px; font-weight:700; padding:3px 10px; border:0.5px solid #e5e7eb; border-radius:99px; cursor:pointer; color:#6b7280; background:#fff; white-space:nowrap; transition:all 0.15s; }
        .h-pill:hover { border-color:#374151; color:#0f172a; }
        .h-pill.active { background:#6366f1; color:#fff; border-color:#6366f1; }
        .badge-news   { background:#0f172a; color:#fff; }
        .badge-fin    { background:#eff6ff; color:#1e40af; }
        .badge-ppl    { background:#f0fdf4; color:#166534; }
        .badge-hire   { background:#fef2f2; color:#991b1b; }
        .badge-sig    { background:#fff7ed; color:#9a3412; }
        .badge-market { background:#faf5ff; color:#6b21a8; }
        .risk-low  { background:#d1fae5; color:#065f46; }
        .risk-mid  { background:#fef3c7; color:#92400e; }
        .risk-high { background:#fee2e2; color:#991b1b; }
      `}</style>

      {/* ── 비상장사 안내 모달 ── */}
      {showUnlistedModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:32, maxWidth:520, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize:16, fontWeight:800, marginBottom:10 }}>비상장사 감지됨</h3>
            <p style={{ fontSize:13, color:'#6b7280', lineHeight:1.6, marginBottom:20 }}>
              <strong style={{ color:'#0f172a' }}>{pendingCompany}</strong>는 DART 및 SEC EDGAR에 등록된 공시 정보가 없는 비상장사입니다.<br /><br />
              공개 뉴스와 서치 기반으로 분석을 진행하며, 재무 정보가 제한될 수 있습니다.
              공식 재무 자료를 직접 입력하면 분석 품질을 높일 수 있습니다.
            </p>

            {/* 수동 입력 폼 */}
            <div style={{ marginBottom:20 }}>
              <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#6b7280', marginBottom:8 }}>참고 링크 입력 (선택)</p>
              <textarea
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                placeholder="재무 보고서 URL, 투자 정보 링크 등을 입력하세요. 여러 개는 줄바꿈으로 구분합니다."
                style={{ width:'100%', height:80, border:'0.5px solid #e5e7eb', borderRadius:8, padding:'8px 10px', fontSize:12, resize:'none', outline:'none', fontFamily:'inherit', color:'#0f172a' }}
              />
            </div>

            {/* 파일/이미지 드래그앤드롭 */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => {
                e.preventDefault()
                setIsDragging(false)
                const files = Array.from(e.dataTransfer.files)
                setManualFiles(prev => [...prev, ...files].slice(0, 5))
              }}
              onClick={() => document.getElementById('fileInput').click()}
              style={{
                border: `1.5px dashed ${isDragging ? '#6366f1' : '#e5e7eb'}`,
                borderRadius: 8, padding: '16px 12px', textAlign: 'center',
                cursor: 'pointer', marginBottom: 16,
                background: isDragging ? '#f5f3ff' : '#f9fafb',
                transition: 'all 0.2s',
              }}
            >
              <p style={{ fontSize:12, color:'#6b7280', margin:0 }}>
                📎 파일 또는 이미지를 드래그하거나 클릭하여 업로드
              </p>
              <p style={{ fontSize:11, color:'#9ca3af', margin:'4px 0 0' }}>재무제표, 투자 자료, 스크린샷 등 (최대 5개)</p>
              <input
                id="fileInput" type="file" multiple accept="image/*,.pdf,.xlsx,.csv"
                style={{ display:'none' }}
                onChange={e => {
                  const files = Array.from(e.target.files)
                  setManualFiles(prev => [...prev, ...files].slice(0, 5))
                }}
              />
            </div>

            {manualFiles.length > 0 && (
              <div style={{ marginBottom:16, display:'flex', flexWrap:'wrap', gap:6 }}>
                {manualFiles.map((f, i) => (
                  <span key={i} style={{ fontSize:10, padding:'3px 8px', background:'#f3f4f6', borderRadius:4, color:'#374151', display:'flex', alignItems:'center', gap:4 }}>
                    {f.name}
                    <button onClick={() => setManualFiles(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ border:'none', background:'none', cursor:'pointer', color:'#9ca3af', fontSize:12, padding:0 }}>×</button>
                  </span>
                ))}
              </div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <button
                onClick={async () => {
                  let combined = manualInput.trim()
                  // 파일 내용 읽기 (이미지는 base64, 텍스트는 그대로)
                  if (manualFiles.length > 0) {
                    combined += '\n\n[첨부 파일: ' + manualFiles.map(f => f.name).join(', ') + ']'
                  }
                  await doAnalyze(pendingCompany, combined || null)
                }}
                style={{ flex:1, height:40, background:'#0f172a', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:800, cursor:'pointer' }}
              >
                {manualInput || manualFiles.length > 0 ? '입력 정보 포함하여 분석' : '수동 입력 없이 분석'}
              </button>
              <button
                onClick={() => { setShowUnlistedModal(false); setPendingCompany('') }}
                style={{ height:40, padding:'0 16px', background:'#f9fafb', color:'#6b7280', border:'0.5px solid #e5e7eb', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer' }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LANDING ── */}
      {view === 'landing' && (
        <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'16px 24px', borderBottom:'0.5px solid #e5e7eb', display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:22, height:22, background:'#0f172a', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, borderRadius:'50%', fontSize:10 }}>B</div>
            <span style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em' }}>Business Intel Dashboard</span>
          </div>
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 24px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:80, maxWidth:760, width:'100%' }}>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.15em', color:'#9ca3af', marginBottom:10 }}>Game Company Intelligence v4.2</p>
                <h1 style={{ fontSize:60, fontWeight:900, letterSpacing:'-0.04em', textTransform:'uppercase', lineHeight:0.88, marginBottom:12 }}>
                  게임사<br /><span style={{ color:'#d1d5db', fontStyle:'italic' }}>인텔리전스</span>
                </h1>
                <p style={{ fontSize:11, color:'#6b7280', lineHeight:1.5 }}>관심 게임사의 뉴스, 재무, 조직, 시장 동향을 한 화면에서 파악하세요.</p>
                {companies.length > 0 && (
                  <p style={{ marginTop:8, fontSize:10, fontWeight:700, color:'#9ca3af' }}>{companies.length}개 저장 기록 연결됨</p>
                )}
              </div>
              <div style={{ width:260, flexShrink:0 }}>
                <p style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color:'#6b7280', marginBottom:8 }}>게임사 검색</p>
                <div style={{ border:'0.5px solid #e5e7eb', borderRadius:12, display:'flex', alignItems:'center', padding:'0 12px', height:44, marginBottom:8 }}>
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && run(query)}
                    placeholder="Nexon, Krafton..."
                    style={{ flex:1, border:'none', outline:'none', fontSize:13, fontWeight:600, color:'#0f172a', background:'transparent' }}
                  />
                </div>
                <button onClick={() => run(query)} style={{ width:'100%', height:40, background:'#0f172a', color:'#fff', border:'none', borderRadius:12, fontWeight:900, fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em' }}>
                  Analyze →
                </button>
                {companies.length > 0 && (
                  <div style={{ marginTop:10 }}>
                    <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em', color:'#9ca3af', marginBottom:6 }}>History</p>
                    <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                      {companies.slice(0, 4).map(c => (
                        <button key={c} className="h-pill" onClick={() => run(c)}>{c}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RESULT ── */}
      {view === 'result' && (
        <div>
          {/* 헤더 */}
          <div style={{ position:'sticky', top:0, zIndex:50, background:'rgba(255,255,255,0.95)', backdropFilter:'blur(12px)', borderBottom:'0.5px solid #e5e7eb' }}>
            <div style={{ padding:'12px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
              <div style={{ cursor:'pointer', display:'flex', flexDirection:'column', gap:4 }} onClick={() => setView('landing')}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:20, height:20, background:'#0f172a', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, borderRadius:'50%', fontSize:9 }}>B</div>
                  <span style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em' }}>Business Intel Dashboard</span>
                </div>
                <span style={{ fontSize:20, fontWeight:900, letterSpacing:'-0.03em', textTransform:'uppercase', lineHeight:1 }}>
                  게임사 <span style={{ color:'#d1d5db', fontStyle:'italic' }}>인텔리전스</span>
                </span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ border:'0.5px solid #e5e7eb', borderRadius:10, display:'flex', alignItems:'center', padding:'0 10px', height:34, background:'#f9fafb', width:200 }}>
                  <input
                    value={headerQuery}
                    onChange={e => setHeaderQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && run(headerQuery)}
                    placeholder="기업명 검색..."
                    style={{ flex:1, border:'none', outline:'none', fontSize:12, fontWeight:600, background:'transparent', color:'#0f172a' }}
                  />
                </div>
                <button onClick={() => run(headerQuery)} style={{ height:34, padding:'0 12px', background:'#0f172a', color:'#fff', border:'none', borderRadius:10, fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                  Analyze →
                </button>
              </div>
            </div>
            {/* 히스토리 바 */}
            <div style={{ padding:'5px 20px', background:'#f9fafb', borderTop:'0.5px solid #f1f5f9', display:'flex', alignItems:'center', gap:8, minHeight:32, overflow:'hidden' }}>
              <span style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color:'#9ca3af', flexShrink:0 }}>History</span>
              <div style={{ display:'flex', gap:5, overflow:'hidden' }}>
                {companies.slice(0, 6).map(c => (
                  <button key={c} className={`h-pill ${result?.company === c ? 'active' : ''}`} onClick={() => run(c)}>{c}</button>
                ))}
              </div>
            </div>
            {/* 진행 바 */}
            {loading && (
              <div style={{ height:2, background:'#e5e7eb', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${progress}%`, background:'#6366f1', transition:'width 0.4s' }} />
              </div>
            )}
            {/* 배너 */}
            {banner && (
              <div style={{ padding:'5px 16px', background: banner.ok ? '#d1fae5' : '#fee2e2', color: banner.ok ? '#065f46' : '#991b1b', fontSize:11, fontWeight:700, textAlign:'center' }}>
                {banner.msg}
              </div>
            )}
            {status && <div style={{ fontSize:11, color:'#6b7280', textAlign:'center', padding:'3px 0' }}>{status}</div>}
          </div>

          {/* 결과 본문 */}
          {result && (
            <div style={{ maxWidth:1100, margin:'0 auto', padding:'24px 20px' }}>
              {/* 회사 헤더 */}
              <div style={{ paddingBottom:20, marginBottom:24, borderBottom:'2px solid #0f172a' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                      <span style={{ padding:'3px 9px', background:'#0f172a', color:'#fff', fontSize:9, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.1em', borderRadius:2 }}>Report</span>
                      <span style={{ fontSize:10, fontWeight:600, textTransform:'uppercase', color:'#9ca3af' }}>Business Intel Report</span>
                    </div>
                    <h2 style={{ fontSize:36, fontWeight:900, letterSpacing:'-0.04em', textTransform:'uppercase', lineHeight:0.9, margin:'6px 0' }}>{result.company}</h2>
                    <p style={{ fontSize:10, color:'#6b7280', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em' }}>
                      Analysis V4.2 / {result.timestamp}
                    </p>
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0, marginTop:6 }}>
                    <button onClick={save} style={{ height:32, padding:'0 14px', background: saved ? '#f9fafb' : '#0f172a', color: saved ? '#6b7280' : '#fff', border:`0.5px solid ${saved ? '#e5e7eb' : '#0f172a'}`, borderRadius:99, fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                      {saved ? '저장됨' : '저장'}
                    </button>
                    <button onClick={() => { setShowTrend(v => !v); setTimeout(() => trendRef.current?.scrollIntoView({behavior:'smooth',block:'start'}), 100) }}
                      style={{ height:32, padding:'0 14px', background:'#fff', color:'#0f172a', border:'0.5px solid #e5e7eb', borderRadius:99, fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                      변동 추이 분석
                    </button>
                  </div>
                </div>
              </div>

              {/* 변동 추이 */}
              {showTrend && (
                <div ref={trendRef} style={{ background:'#f9fafb', border:'0.5px solid #e5e7eb', borderRadius:12, padding:16, marginBottom:20 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                    <span style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.12em' }}>변동 추이 분석</span>
                    <button onClick={() => setShowTrend(false)} style={{ height:26, padding:'0 10px', background:'#fff', border:'0.5px solid #e5e7eb', borderRadius:8, fontSize:10, fontWeight:700 }}>닫기</button>
                  </div>
                  {(() => {
                    const recs = history.filter(r => r.company === result.company).sort((a,b) => b.timestamp.localeCompare(a.timestamp))
                    if (!recs.length) return <p style={{ fontSize:12, color:'#6b7280', textAlign:'center', padding:10 }}>저장된 히스토리가 없습니다.</p>
                    const GL = { financial:'재정',newgame:'신작 성과',org:'조직 안정성',ma:'투자/M&A',live:'라이브 건강도',media:'대외 화제성',hiring:'채용',portfolio:'포트폴리오',hitscore:'신작 흥행력',market:'시장 경쟁력',risk:'종합 위험도' }
                    const changes = Object.keys(GL).filter(k => {
                      const cur = result.gauge?.[k]?.val
                      const prev = recs.find(r => r.gauge?.[k])?.gauge?.[k]?.val
                      return cur && prev && cur !== prev
                    }).map(k => ({ label: GL[k], prev: recs.find(r => r.gauge?.[k])?.gauge?.[k]?.val, cur: result.gauge[k].val }))
                    return (
                      <>
                        {changes.length > 0 ? (
                          <div style={{ marginBottom:12 }}>
                            <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', color:'#9ca3af', marginBottom:8 }}>계기판 변화</p>
                            {changes.map(c => (
                              <div key={c.label} style={{ display:'flex', alignItems:'center', gap:8, fontSize:11, padding:'4px 0', borderBottom:'0.5px solid #f1f5f9' }}>
                                <span style={{ color:'#6b7280', width:100, flexShrink:0 }}>{c.label}</span>
                                <span style={{ fontWeight:700 }}>{c.prev}</span>
                                <span style={{ color:'#d1d5db' }}>→</span>
                                <span style={{ fontWeight:700, color:'#6366f1' }}>{c.cur}</span>
                              </div>
                            ))}
                          </div>
                        ) : <p style={{ fontSize:12, color:'#6b7280', marginBottom:10 }}>직전 저장 대비 계기판 변화 없음</p>}
                        <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', color:'#9ca3af', marginBottom:8 }}>수집 히스토리 ({recs.length}회)</p>
                        {recs.map((rec, idx) => {
                          const prev = recs[idx+1]
                          let diff = prev ? '변화 없음' : '최초 수집'
                          if (prev) { const ch = []; if (JSON.stringify(rec.news)!==JSON.stringify(prev.news)) ch.push('뉴스'); if (JSON.stringify(rec.finance)!==JSON.stringify(prev.finance)) ch.push('재무'); if (ch.length) diff='변화: '+ch.join('·') }
                          const ha = rec.alert_level && rec.alert_level !== 'normal'
                          return (
                            <div key={idx} style={{ display:'flex', gap:8, marginBottom:10 }}>
                              <div style={{ width:7, height:7, borderRadius:'50%', background: ha?'#ef4444':'#6366f1', flexShrink:0, marginTop:3 }} />
                              <div>
                                <p style={{ fontSize:10, color:'#9ca3af' }}>{rec.timestamp}</p>
                                <p style={{ fontSize:12, fontWeight:600 }}>{diff}</p>
                                <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, background: ha?'#fee2e2':'#d1fae5', color: ha?'#991b1b':'#065f46' }}>{ha?'주의 시그널':'이상 없음'}</span>
                              </div>
                            </div>
                          )
                        })}
                      </>
                    )
                  })()}
                </div>
              )}

              {/* 01 Executive Summary */}
              <div style={{ marginBottom:28 }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:16 }}>
                  <span style={{ fontSize:28, fontWeight:900, fontStyle:'italic', color:'#c8d0db' }}>01</span>
                  <span style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.15em' }}>Executive Summary</span>
                  <div style={{ flex:1, height:0.5, background:'#e5e7eb' }} />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 190px', gap:20, alignItems:'start' }}>
                  <div>
                    <p style={{ fontSize:16, fontWeight:600, lineHeight:1.3, letterSpacing:'-0.01em', marginBottom:14 }}>{result.summary}</p>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {(result.summary_points||[]).map((p, i) => (
                        <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, fontSize:12, lineHeight:1.5, color:'#6b7280' }}>
                          <div style={{ width:6, height:6, borderRadius:'50%', flexShrink:0, marginTop:4, background: p.color==='green'?'#10b981':p.color==='amber'?'#f59e0b':p.color==='red'?'#ef4444':'#3b82f6' }} />
                          <span>{p.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding:12, background:'#f9fafb', borderRadius:12, border:'0.5px solid #e5e7eb' }}>
                    <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.12em', color:'#9ca3af', marginBottom:8 }}>Risk Assessment</p>
                    <div className={`risk-${riskClass}`} style={{ display:'block', textAlign:'center', padding:9, borderRadius:8, fontSize:11, fontWeight:900, textTransform:'uppercase' }}>
                      {risk} RISK
                    </div>
                    <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.12em', color:'#9ca3af', margin:'10px 0 6px' }}>Key Tags</p>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                      {(result.summary_tags||[]).map((t, i) => {
                        const [bg, color] = (TC[t.type]||['#f1f5f9','#475569'])
                        return <span key={i} style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:4, background:bg, color }}>{t.label}</span>
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* 02 Performance Index */}
              <div style={{ marginBottom:28 }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:16 }}>
                  <span style={{ fontSize:28, fontWeight:900, fontStyle:'italic', color:'#c8d0db' }}>02</span>
                  <span style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.15em' }}>Performance Index</span>
                  <div style={{ flex:1, height:0.5, background:'#e5e7eb' }} />
                </div>
                <GaugeGroup label="내부 현황" items={G1} gauge={result.gauge} />
                <GaugeGroup label="시장 / 제품 현황" items={G2} gauge={result.gauge} />
                <div>
                  <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.12em', color:'#9ca3af', marginBottom:8 }}>종합</p>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                    <GaugeCard item={{ key:'risk', label:'종합 위험도' }} gauge={result.gauge} highlight={true} />
                  </div>
                </div>
              </div>

              {/* 03 Detailed Analysis */}
              <div>
                <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:8 }}>
                  <span style={{ fontSize:28, fontWeight:900, fontStyle:'italic', color:'#c8d0db' }}>03</span>
                  <span style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.15em' }}>Detailed Analysis</span>
                  <div style={{ flex:1, height:0.5, background:'#e5e7eb' }} />
                </div>
                {Object.keys(dataDates).some(k => dataDates[k]) && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 16px', marginBottom:16, padding:'8px 12px', background:'#f9fafb', borderRadius:8, border:'0.5px solid #e5e7eb' }}>
                    <span style={{ fontSize:10, fontWeight:700, color:'#6b7280', flexShrink:0 }}>데이터 기준일</span>
                    {dataDates.news    && <span style={{ fontSize:10, color:'#9ca3af' }}>뉴스 {dataDates.news}</span>}
                    {dataDates.hiring  && <span style={{ fontSize:10, color:'#9ca3af' }}>채용 {dataDates.hiring}</span>}
                    {dataDates.community && <span style={{ fontSize:10, color:'#9ca3af' }}>커뮤니티 {dataDates.community}{communityExtended ? ' (1년 기준)' : ''}</span>}
                    {dataDates.dart    && <span style={{ fontSize:10, color:'#9ca3af' }}>DART {dataDates.dart}</span>}
                    {dataDates.sec     && <span style={{ fontSize:10, color:'#9ca3af' }}>SEC {dataDates.sec}</span>}
                  </div>
                )}
                {DC.map(conf => {
                  const items = result[conf.key] || []
                  return (
                    <div key={conf.key} style={{ borderLeft:'2px solid #0f172a', paddingLeft:18, marginBottom:24 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                        <span style={{ fontSize:14, fontWeight:900, letterSpacing:'-0.02em' }}>{conf.title}</span>
                        <span className={`badge-${conf.badge}`} style={{ fontSize:9, fontWeight:800, padding:'3px 7px', borderRadius:2, textTransform:'uppercase' }}>{conf.title.split('/')[0].trim()}</span>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        {items.map((item, i) => (
                          <div key={i} style={{ fontSize:12, color:'#0f172a', lineHeight:1.6 }}>
                            <strong style={{ fontWeight:700 }}>{item.topic}</strong> — {item.content}
                            <a href={item.source_url||'#'} target="_blank" rel="noopener" style={{ fontSize:10, fontWeight:700, color:'#6366f1', marginLeft:4 }}>
                              [{item.source}{item.date ? ', '+item.date : ''}]
                            </a>
                          </div>
                        ))}
                      </div>
                      {(conf.key === 'signal' || conf.key === 'market') && (result.signal_tags||[]).length > 0 && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:10, paddingTop:8, borderTop:'0.5px solid #e5e7eb' }}>
                          {(result.signal_tags||[]).map((t, i) => {
                            const [bg, color] = (TC[t.type]||['#f1f5f9','#475569'])
                            return <span key={i} style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:4, background:bg, color }}>{t.label}</span>
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
