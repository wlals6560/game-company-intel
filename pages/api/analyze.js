export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { company } = req.body
  if (!company) return res.status(400).json({ error: '게임사명이 필요합니다.' })

  const apiKey       = process.env.ANTHROPIC_API_KEY
  const naverClient  = process.env.NAVER_CLIENT_ID
  const naverSecret  = process.env.NAVER_CLIENT_SECRET

  if (!apiKey) return res.status(500).json({ error: 'API 키 미설정' })

  // ── 1. 실시간 뉴스 수집 ──
  let newsContext = ''
  try {
    const [naverNews, googleNews] = await Promise.allSettled([
      fetchNaverNews(company, naverClient, naverSecret),
      fetchGoogleNews(company),
    ])

    const naverItems = naverNews.status === 'fulfilled' ? naverNews.value : []
    const googleItems = googleNews.status === 'fulfilled' ? googleNews.value : []
    const allNews = [...naverItems, ...googleItems].slice(0, 20)

    if (allNews.length > 0) {
      newsContext = `\n\n## 최신 뉴스 (실시간 수집 ${new Date().toLocaleDateString('ko-KR')} 기준)\n` +
        allNews.map(n => `- [${n.date}] ${n.title} (${n.source})\n  ${n.description}`).join('\n')
    }
  } catch (e) {
    console.warn('뉴스 수집 실패:', e.message)
  }

  // ── 2. Claude 분석 ──
  const prompt = `"${company}"에 대해 게임 업계 전문가 관점에서 분석하고, 아래 JSON만 출력하세요. 마크다운 없이 순수 JSON만.

규칙:
- 각 항목은 최대 5개 불렛
- 문장 말맺음은 "~함","~임","~됨" 등 명사형
- 아래 최신 뉴스 데이터를 최우선으로 반영하여 분석할 것
- 반드시 JSON을 완전히 닫아서 출력${newsContext}

{
  "summary": "한 줄 핵심 요약(50자 이내)",
  "summary_points": [
    {"color": "green", "text": "긍정 포인트"},
    {"color": "amber", "text": "주의 포인트"},
    {"color": "blue",  "text": "중립 포인트"}
  ],
  "summary_tags": [{"type": "g", "label": "태그1"}, {"type": "a", "label": "태그2"}],
  "news":    [{"topic": "주제", "content": "내용. ~함", "source": "출처", "source_url": "", "date": "YYYY.MM.DD"}],
  "finance": [{"topic": "주제", "content": "내용. ~임", "source": "출처", "source_url": "", "date": "YYYY.MM.DD"}],
  "people":  [{"topic": "주제", "content": "내용. ~함", "source": "출처", "source_url": "", "date": "YYYY.MM.DD"}],
  "hiring":  [{"topic": "주제", "content": "내용. ~중", "source": "출처", "source_url": "", "date": "YYYY.MM.DD"}],
  "market":  [{"topic": "주제", "content": "내용. ~함", "source": "출처", "source_url": "", "date": "YYYY.MM.DD"}],
  "signal":  [{"topic": "주제", "content": "내용. ~함", "source": "출처", "source_url": "", "date": "YYYY.MM.DD"}],
  "signal_tags": [{"type": "g", "label": "긍정"}, {"type": "a", "label": "주의"}],
  "gauge": {
    "financial": {"val": "안정", "reason": "근거", "pct": 80},
    "newgame":   {"val": "보통", "reason": "근거", "pct": 55},
    "org":       {"val": "안정", "reason": "근거", "pct": 75},
    "ma":        {"val": "유지", "reason": "근거", "pct": 60},
    "live":      {"val": "건강", "reason": "근거", "pct": 80},
    "media":     {"val": "보통", "reason": "근거", "pct": 60},
    "hiring":    {"val": "확대", "reason": "근거", "pct": 70},
    "portfolio": {"val": "유지", "reason": "근거", "pct": 60},
    "hitscore":  {"val": "보통", "reason": "근거", "pct": 55},
    "market":    {"val": "유지", "reason": "근거", "pct": 65},
    "risk":      {"val": "보통", "reason": "종합 근거", "pct": 45}
  },
  "alert_level": "normal"
}`

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

    if (!response.ok) {
      const err = await response.text()
      return res.status(500).json({ error: 'Anthropic API 오류: ' + err })
    }

    const data = await response.json()
    const text = data.content.map(i => i.text || '').join('')
    const s = text.indexOf('{'), e = text.lastIndexOf('}')
    if (s < 0 || e < 0) return res.status(500).json({ error: 'JSON 파싱 실패' })

    let clean = text.slice(s, e + 1)
    try {
      return res.status(200).json(JSON.parse(clean))
    } catch {
      const op = (clean.match(/\{/g)||[]).length - (clean.match(/\}/g)||[]).length
      const oa = (clean.match(/\[/g)||[]).length - (clean.match(/\]/g)||[]).length
      for (let i = 0; i < oa; i++) clean += ']'
      for (let i = 0; i < op; i++) clean += '}'
      return res.status(200).json(JSON.parse(clean))
    }
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// ── 네이버 뉴스 검색 ──
async function fetchNaverNews(company, clientId, clientSecret) {
  if (!clientId || !clientSecret) return []
  const query = encodeURIComponent(company + ' 게임')
  const res = await fetch(
    `https://openapi.naver.com/v1/search/news.json?query=${query}&display=10&sort=date`,
    {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    }
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.items || []).map(item => ({
    title: item.title.replace(/<[^>]+>/g, ''),
    description: item.description.replace(/<[^>]+>/g, '').slice(0, 150),
    source: '네이버뉴스',
    date: new Date(item.pubDate).toLocaleDateString('ko-KR'),
    url: item.originallink || item.link,
  }))
}

// ── Google News RSS ──
async function fetchGoogleNews(company) {
  const query = encodeURIComponent(`${company} 게임`)
  const url = `https://news.google.com/rss/search?q=${query}&hl=ko&gl=KR&ceid=KR:ko`
  const res = await fetch(url)
  if (!res.ok) return []
  const xml = await res.text()
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
  return items.slice(0, 10).map(item => {
    const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/) || [])[1] || ''
    const desc  = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/) || [])[1] || ''
    const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || ''
    const source  = (item.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || 'Google News'
    return {
      title: title.replace(/<[^>]+>/g, '').slice(0, 100),
      description: desc.replace(/<[^>]+>/g, '').slice(0, 150),
      source,
      date: pubDate ? new Date(pubDate).toLocaleDateString('ko-KR') : '',
    }
  })
}
