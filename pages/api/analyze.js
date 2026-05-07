export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { company, manualData } = req.body
  if (!company) return res.status(400).json({ error: '게임사명이 필요합니다.' })

  const apiKey      = process.env.ANTHROPIC_API_KEY
  const naverClient = process.env.NAVER_CLIENT_ID
  const naverSecret = process.env.NAVER_CLIENT_SECRET
  const dartKey     = process.env.DART_API_KEY
  const gcsApiKey   = process.env.GOOGLE_CSE_API_KEY
  const gcsEngineId = process.env.GOOGLE_CSE_ENGINE_ID

  if (!apiKey) return res.status(500).json({ error: 'API 키 미설정' })

  // ── 1. 실시간 데이터 병렬 수집 ──
  const [
    naverGeneralResult,
    naverHiringResult,
    googleGeneralResult,
    googleHiringResult,
    dartResult,
    secResult,
    communityResult,
  ] = await Promise.allSettled([
    fetchNaverNews(company, naverClient, naverSecret, company + ' 게임'),
    fetchNaverNews(company, naverClient, naverSecret, company + ' 채용 공고 모집'),
    fetchGoogleNews(company + ' 게임'),
    fetchGoogleNews(company + ' 채용 모집 공고'),
    fetchDartData(company, dartKey),
    fetchSecData(company),
    fetchCommunityData(company, gcsApiKey, gcsEngineId),
  ])

  const naverGeneral  = naverGeneralResult.status  === 'fulfilled' ? naverGeneralResult.value : { items: [], latestDate: null }
  const naverHiring   = naverHiringResult.status   === 'fulfilled' ? naverHiringResult.value  : { items: [], latestDate: null }
  const googleGeneral = googleGeneralResult.status === 'fulfilled' ? googleGeneralResult.value: { items: [], latestDate: null }
  const googleHiring  = googleHiringResult.status  === 'fulfilled' ? googleHiringResult.value : { items: [], latestDate: null }
  const dartData      = dartResult.status          === 'fulfilled' ? dartResult.value         : null
  const secData       = secResult.status           === 'fulfilled' ? secResult.value          : null
  const communityData = communityResult.status     === 'fulfilled' ? communityResult.value    : { items: [], quota_exceeded: false, latestDate: null, extended: false }

  // 뉴스 합치기 + 최신 날짜 추출
  const generalNewsItems = [...(naverGeneral.items||[]), ...(googleGeneral.items||[])]
    .filter((item, idx, self) => self.findIndex(t => t.title === item.title) === idx)
    .slice(0, 15)
  const generalLatest = getLatestDate([naverGeneral.latestDate, googleGeneral.latestDate])

  const hiringNewsItems = [...(naverHiring.items||[]), ...(googleHiring.items||[])]
    .filter((item, idx, self) => self.findIndex(t => t.title === item.title) === idx)
    .slice(0, 10)
  const hiringLatest = getLatestDate([naverHiring.latestDate, googleHiring.latestDate])

  const isUnlisted = !dartData && !secData

  // ── 2. 컨텍스트 구성 (섹션별 기준일 명시) ──
  let dataContext = ''

  if (generalNewsItems.length > 0) {
    dataContext += `\n\n## 최신 뉴스${generalLatest ? ` (최신 기사 기준: ${generalLatest})` : ''}\n` +
      generalNewsItems.map(n => `- [${n.date}] ${n.title} (${n.source})\n  ${n.description}`).join('\n')
  }

  if (hiringNewsItems.length > 0) {
    dataContext += `\n\n## 채용 정보${hiringLatest ? ` (최신 공고 기준: ${hiringLatest})` : ''}\n` +
      hiringNewsItems.map(n => `- [${n.date}] ${n.title} (${n.source})\n  ${n.description}`).join('\n')
  }

  if (communityData.items.length > 0) {
    const periodNote = communityData.extended ? '최근 1년' : '최근 6개월'
    dataContext += `\n\n## 커뮤니티/SNS 반응 (${periodNote}${communityData.latestDate ? `, 최신: ${communityData.latestDate}` : ''})\n` +
      communityData.items.map(n => `- ${n.title} (${n.source})\n  ${n.snippet}`).join('\n')
  }

  if (dartData) {
    dataContext += `\n\n## DART 공시/재무${dartData.latestDate ? ` (기준: ${dartData.latestDate})` : ''}\n` + dartData.content
  }

  if (secData) {
    dataContext += `\n\n## SEC EDGAR 공시${secData.latestDate ? ` (기준: ${secData.latestDate})` : ''}\n` + secData.content
  }

  if (manualData) {
    dataContext += `\n\n## 수동 입력 추가 정보\n` + manualData
  }

  if (!dataContext) {
    dataContext = '\n\n(실시간 데이터 수집 실패 — 학습 데이터 기반으로 분석)'
  }

  // ── 3. Claude 분석 ──
  const today = new Date().toLocaleDateString('ko-KR')
  const prompt = `"${company}"에 대해 게임 업계 전문가 관점에서 분석하고, 아래 JSON만 출력하세요. 마크다운 없이 순수 JSON만.

규칙:
- 각 항목은 최대 5개 불렛
- 문장 말맺음은 "~함","~임","~됨" 등 명사형으로 압축
- 아래 실시간 수집 데이터를 최우선으로 반영할 것
- 각 불렛의 source와 date는 실제 수집된 데이터 기준으로 정확히 기재 (날짜 없으면 빈 문자열)
- 섹션별로 데이터 기준 날짜가 다를 수 있으므로 각 항목에 정확한 출처 날짜를 반드시 기재
- 채용 관련 뉴스는 hiring 항목에 반영
- 커뮤니티/SNS 반응은 media 게이지 판단에 반영
- 반드시 JSON을 완전히 닫아서 출력
- 오늘 날짜: ${today}
${dataContext}

{"summary":"한 줄 핵심 요약(50자 이내)","summary_points":[{"color":"green","text":"긍정 포인트"},{"color":"amber","text":"주의 포인트"},{"color":"blue","text":"중립 포인트"}],"summary_tags":[{"type":"g","label":"태그1"},{"type":"a","label":"태그2"}],"news":[{"topic":"주제","content":"내용. ~함","source":"출처","source_url":"","date":"YYYY.MM.DD"}],"finance":[{"topic":"주제","content":"내용. ~임","source":"출처","source_url":"","date":"YYYY.MM.DD"}],"people":[{"topic":"주제","content":"내용. ~함","source":"출처","source_url":"","date":"YYYY.MM.DD"}],"hiring":[{"topic":"주제","content":"내용. ~중","source":"출처","source_url":"","date":"YYYY.MM.DD"}],"market":[{"topic":"주제","content":"내용. ~함","source":"출처","source_url":"","date":"YYYY.MM.DD"}],"signal":[{"topic":"주제","content":"내용. ~함","source":"출처","source_url":"","date":"YYYY.MM.DD"}],"signal_tags":[{"type":"g","label":"긍정"},{"type":"a","label":"주의"}],"gauge":{"financial":{"val":"안정","reason":"근거","pct":80},"newgame":{"val":"보통","reason":"근거","pct":55},"org":{"val":"안정","reason":"근거","pct":75},"ma":{"val":"유지","reason":"근거","pct":60},"live":{"val":"건강","reason":"근거","pct":80},"media":{"val":"보통","reason":"근거","pct":60},"hiring":{"val":"확대","reason":"근거","pct":70},"portfolio":{"val":"유지","reason":"근거","pct":60},"hitscore":{"val":"보통","reason":"근거","pct":55},"market":{"val":"유지","reason":"근거","pct":65},"risk":{"val":"보통","reason":"종합 근거","pct":45}},"alert_level":"normal"}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) return res.status(500).json({ error: 'Anthropic API 오류: ' + await response.text() })

    const data = await response.json()
    const text = data.content.map(i => i.text || '').join('')
    const s = text.indexOf('{'), e = text.lastIndexOf('}')
    if (s < 0 || e < 0) return res.status(500).json({ error: 'JSON 파싱 실패' })

    let clean = text.slice(s, e + 1)
    let parsed
    try { parsed = JSON.parse(clean) }
    catch {
      const op = (clean.match(/\{/g)||[]).length - (clean.match(/\}/g)||[]).length
      const oa = (clean.match(/\[/g)||[]).length - (clean.match(/\]/g)||[]).length
      for (let i = 0; i < oa; i++) clean += ']'
      for (let i = 0; i < op; i++) clean += '}'
      parsed = JSON.parse(clean)
    }

    // 섹션별 데이터 기준일 메타 추가
    parsed._meta = {
      is_unlisted: isUnlisted,
      community_quota_exceeded: communityData.quota_exceeded,
      community_period_extended: communityData.extended,
      data_dates: {
        news:      generalLatest,
        hiring:    hiringLatest,
        community: communityData.latestDate,
        dart:      dartData?.latestDate || null,
        sec:       secData?.latestDate  || null,
      },
    }

    return res.status(200).json(parsed)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// ── 유틸: 날짜 배열에서 가장 최신 날짜 반환 ──
function getLatestDate(dates) {
  const valid = dates.filter(Boolean)
  if (!valid.length) return null
  return valid.sort((a, b) => new Date(b) - new Date(a))[0]
}

// ── 네이버 뉴스 ──
async function fetchNaverNews(company, clientId, clientSecret, query) {
  if (!clientId || !clientSecret) return { items: [], latestDate: null }
  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=10&sort=date`,
      { headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret } }
    )
    if (!res.ok) return { items: [], latestDate: null }
    const data = await res.json()
    const items = (data.items || []).map(item => ({
      title: item.title.replace(/<[^>]+>/g, ''),
      description: item.description.replace(/<[^>]+>/g, '').slice(0, 150),
      source: '네이버뉴스',
      date: new Date(item.pubDate).toLocaleDateString('ko-KR'),
      _dateObj: new Date(item.pubDate),
    }))
    const latestDate = items.length > 0
      ? items.sort((a,b) => b._dateObj - a._dateObj)[0]._dateObj.toLocaleDateString('ko-KR')
      : null
    return { items, latestDate }
  } catch { return { items: [], latestDate: null } }
}

// ── Google News RSS ──
async function fetchGoogleNews(query) {
  try {
    const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`)
    if (!res.ok) return { items: [], latestDate: null }
    const xml = await res.text()
    const rawItems = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    const items = rawItems.slice(0, 10).map(item => {
      const title   = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)   || item.match(/<title>(.*?)<\/title>/)   || [])[1] || ''
      const desc    = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/) || [])[1] || ''
      const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || ''
      const source  = (item.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || 'Google News'
      const dateObj = pubDate ? new Date(pubDate) : null
      return {
        title: title.replace(/<[^>]+>/g, '').slice(0, 100),
        description: desc.replace(/<[^>]+>/g, '').slice(0, 150),
        source,
        date: dateObj ? dateObj.toLocaleDateString('ko-KR') : '',
        _dateObj: dateObj,
      }
    })
    const withDate = items.filter(i => i._dateObj)
    const latestDate = withDate.length > 0
      ? withDate.sort((a,b) => b._dateObj - a._dateObj)[0]._dateObj.toLocaleDateString('ko-KR')
      : null
    return { items, latestDate }
  } catch { return { items: [], latestDate: null } }
}

// ── Google Custom Search (커뮤니티/SNS) — 6개월 우선, 없으면 1년 ──
async function fetchCommunityData(company, apiKey, engineId) {
  if (!apiKey || !engineId) return { items: [], quota_exceeded: false, latestDate: null, extended: false }

  const query = encodeURIComponent(`${company} 게임`)
  const now = new Date()

  // 6개월 전 날짜
  const sixMonthsAgo = new Date(now)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const dateStr6m = sixMonthsAgo.toISOString().split('T')[0]

  // 1년 전 날짜
  const oneYearAgo = new Date(now)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const dateStr1y = oneYearAgo.toISOString().split('T')[0]

  async function search(afterDate) {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${engineId}&q=${query}&num=10&lr=lang_ko&dateRestrict=m6&sort=date:r:${afterDate.replace(/-/g,'')}:${now.toISOString().split('T')[0].replace(/-/g,'')}`
    const res = await fetch(url)
    if (res.status === 429 || res.status === 403) return { quota_exceeded: true, items: [] }
    if (!res.ok) return { quota_exceeded: false, items: [] }
    const data = await res.json()
    if (data.error?.code === 429) return { quota_exceeded: true, items: [] }
    return {
      quota_exceeded: false,
      items: (data.items || []).map(item => ({
        title: item.title || '',
        snippet: (item.snippet || '').slice(0, 150),
        source: (() => { try { return new URL(item.link).hostname.replace('www.','') } catch { return '' } })(),
        url: item.link,
        date: item.pagemap?.metatags?.[0]?.['article:published_time']
          ? new Date(item.pagemap.metatags[0]['article:published_time']).toLocaleDateString('ko-KR')
          : '',
      }))
    }
  }

  try {
    // 1차: 최근 6개월
    const result6m = await search(dateStr6m)
    if (result6m.quota_exceeded) return { items: [], quota_exceeded: true, latestDate: null, extended: false }

    if (result6m.items.length > 0) {
      const dates = result6m.items.map(i => i.date).filter(Boolean)
      const latestDate = dates.length > 0 ? dates[0] : null
      return { items: result6m.items, quota_exceeded: false, latestDate, extended: false }
    }

    // 2차: 6개월 내 없으면 1년으로 확장
    const result1y = await search(dateStr1y)
    if (result1y.quota_exceeded) return { items: [], quota_exceeded: true, latestDate: null, extended: true }

    const dates = result1y.items.map(i => i.date).filter(Boolean)
    const latestDate = dates.length > 0 ? dates[0] : null
    return { items: result1y.items, quota_exceeded: false, latestDate, extended: true }

  } catch { return { items: [], quota_exceeded: false, latestDate: null, extended: false } }
}

// ── DART ──
async function fetchDartData(company, dartKey) {
  if (!dartKey) return null
  try {
    const searchRes = await fetch(
      `https://opendart.fss.or.kr/api/company.json?crtfc_key=${dartKey}&corp_name=${encodeURIComponent(company)}&page_no=1&page_count=1`
    )
    if (!searchRes.ok) return null
    const searchData = await searchRes.json()
    const corp = searchData.list?.[0]
    if (!corp) return null
    const corpCode = corp.corp_code

    const [discRes, finRes] = await Promise.allSettled([
      fetch(`https://opendart.fss.or.kr/api/list.json?crtfc_key=${dartKey}&corp_code=${corpCode}&page_no=1&page_count=5&last_reprt_at=Y`),
      fetch(`https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json?crtfc_key=${dartKey}&corp_code=${corpCode}&bsns_year=${new Date().getFullYear()-1}&reprt_code=11011&fs_div=CFS`),
    ])

    let content = `회사명: ${corp.corp_name} (${corp.stock_code || '비상장'})\n`
    let latestDate = null

    if (discRes.status === 'fulfilled' && discRes.value.ok) {
      const dd = await discRes.value.json()
      const list = dd.list || []
      if (list.length > 0) {
        content += '\n최근 공시:\n' + list.map(d => `- [${d.rcept_dt}] ${d.report_nm}`).join('\n')
        latestDate = list[0].rcept_dt // 가장 최신 공시일
      }
    }
    if (finRes.status === 'fulfilled' && finRes.value.ok) {
      const fd = await finRes.value.json()
      const items = fd.list?.slice(0, 5) || []
      if (items.length > 0) {
        content += '\n\n재무 현황:\n' + items.map(f => `- ${f.account_nm}: ${Number(f.thstrm_amount||0).toLocaleString()}원`).join('\n')
        if (!latestDate) latestDate = `${new Date().getFullYear()-1}년 연간`
      }
    }
    return { content, latestDate, unlisted: false }
  } catch { return null }
}

// ── SEC EDGAR ──
async function fetchSecData(company) {
  try {
    const res = await fetch(
      `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(company)}%22&forms=10-K,20-F`,
      { headers: { 'User-Agent': 'game-intel-dashboard contact@example.com' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const hits = data.hits?.hits || []
    if (!hits.length) return null

    const filings = hits.slice(0, 5).map(h => {
      const s = h._source || {}
      return `- [${s.file_date||''}] ${s.form_type||''}: ${s.display_names||s.entity_name||''} — ${s.period_of_report||''}`
    }).join('\n')

    const latestDate = hits[0]?._source?.file_date || null
    return { content: `SEC EDGAR 최근 공시:\n${filings}`, latestDate, unlisted: false }
  } catch { return null }
}
