export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { company } = req.body
  if (!company) {
    return res.status(400).json({ error: '게임사명이 필요합니다.' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' })
  }

  const prompt = `"${company}"에 대해 게임 업계 전문가 관점에서 분석하고, 아래 JSON만 출력하세요. 마크다운 없이 순수 JSON만.

규칙:
- 각 항목(news, finance, people, hiring, market, signal)은 최대 5개 불렛
- 문장 말맺음은 "~함","~임","~됨" 등 명사형으로 압축
- 반드시 JSON을 완전히 닫아서 출력

{
  "summary": "한 줄 핵심 요약(50자 이내)",
  "summary_points": [
    {"color": "green", "text": "긍정 포인트"},
    {"color": "amber", "text": "주의 포인트"},
    {"color": "blue", "text": "중립 포인트"}
  ],
  "summary_tags": [{"type": "g", "label": "태그1"}, {"type": "a", "label": "태그2"}],
  "news": [{"topic": "주제", "content": "내용. ~함", "source": "출처", "source_url": "", "date": "YYYY.MM.DD"}],
  "finance": [{"topic": "주제", "content": "내용. ~임", "source": "출처", "source_url": "", "date": "YYYY.MM.DD"}],
  "people": [{"topic": "주제", "content": "내용. ~함", "source": "출처", "source_url": "", "date": "YYYY.MM.DD"}],
  "hiring": [{"topic": "주제", "content": "내용. ~중", "source": "출처", "source_url": "", "date": "YYYY.MM.DD"}],
  "market": [{"topic": "주제", "content": "내용. ~함", "source": "출처", "source_url": "", "date": "YYYY.MM.DD"}],
  "signal": [{"topic": "주제", "content": "내용. ~함", "source": "출처", "source_url": "", "date": "YYYY.MM.DD"}],
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
        model: 'claude-sonnet-4-20250514',
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

    // JSON 추출 및 파싱
    const s = text.indexOf('{')
    const e = text.lastIndexOf('}')
    if (s < 0 || e < 0) {
      return res.status(500).json({ error: 'JSON 파싱 실패: ' + text.slice(0, 200) })
    }

    let clean = text.slice(s, e + 1)
    try {
      const parsed = JSON.parse(clean)
      return res.status(200).json(parsed)
    } catch {
      // 잘린 JSON 복구
      const op = (clean.match(/\{/g) || []).length - (clean.match(/\}/g) || []).length
      const oa = (clean.match(/\[/g) || []).length - (clean.match(/\]/g) || []).length
      for (let i = 0; i < oa; i++) clean += ']'
      for (let i = 0; i < op; i++) clean += '}'
      const parsed = JSON.parse(clean)
      return res.status(200).json(parsed)
    }
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
