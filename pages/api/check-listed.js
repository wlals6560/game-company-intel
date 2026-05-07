export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { company } = req.body
  if (!company) return res.status(400).json({ error: '게임사명 필요' })

  const dartKey = process.env.DART_API_KEY

  // 입력값 변형 목록 생성 (한글/영문/약어 모두 커버)
  const variants = getSearchVariants(company)

  // DART + SEC 병렬 검색
  const [dartResult, secResult] = await Promise.allSettled([
    checkDartMulti(variants, dartKey),
    checkSecMulti(variants),
  ])

  const dartFound = dartResult.status === 'fulfilled' ? dartResult.value : null
  const secFound  = secResult.status  === 'fulfilled' ? secResult.value  : null

  // 하나라도 찾으면 상장사
  if (dartFound === true || secFound === true) {
    return res.status(200).json({ is_unlisted: false, in_dart: dartFound === true, in_sec: secFound === true })
  }

  // 둘 다 조회 실패(에러) → 불명확 → 비상장 모달 안 띄움
  if (dartFound === null && secFound === null) {
    return res.status(200).json({ is_unlisted: false, check_failed: true })
  }

  // 하나라도 에러 → 불명확 → 비상장 모달 안 띄움
  if (dartFound === null || secFound === null) {
    return res.status(200).json({ is_unlisted: false, check_failed: true })
  }

  // 둘 다 정상 조회됐는데 없음 → 비상장
  return res.status(200).json({ is_unlisted: true, in_dart: false, in_sec: false })
}

// 입력값으로부터 검색 변형 생성
function getSearchVariants(company) {
  const variants = new Set()
  const raw = company.trim()

  variants.add(raw)                          // 원본: 크래프톤
  variants.add(raw.toLowerCase())            // 소문자: krafton
  variants.add(raw.toUpperCase())            // 대문자: KRAFTON

  // 한글 앞에 "주식회사", "(주)" 제거/추가
  variants.add(raw.replace(/^(주식회사\s*|\(주\)\s*)/, ''))
  variants.add(raw.replace(/\s*(Inc\.|Corp\.|Co\.,?\s*Ltd\.?|Games|Entertainment|Interactive)/i, '').trim())

  // 공백 제거
  variants.add(raw.replace(/\s/g, ''))

  // 앞 2~4글자만 (부분 검색용)
  if (raw.length >= 2) variants.add(raw.slice(0, Math.min(4, raw.length)))

  return [...variants].filter(v => v.length >= 1)
}

// DART 다중 변형 검색
async function checkDartMulti(variants, dartKey) {
  if (!dartKey) return null
  for (const variant of variants) {
    try {
      const res = await fetch(
        `https://opendart.fss.or.kr/api/company.json?crtfc_key=${dartKey}&corp_name=${encodeURIComponent(variant)}&page_no=1&page_count=5`
      )
      if (!res.ok) continue
      const data = await res.json()
      if (data.status === '000' && data.list?.length > 0) return true  // 찾음
    } catch { continue }
  }
  // 모든 변형 검색 실패
  return false
}

// SEC EDGAR 다중 변형 검색
async function checkSecMulti(variants) {
  for (const variant of variants) {
    try {
      const res = await fetch(
        `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(variant)}%22&forms=10-K,20-F`,
        { headers: { 'User-Agent': 'game-intel-dashboard contact@example.com' } }
      )
      if (!res.ok) continue
      const data = await res.json()
      if ((data.hits?.hits?.length || 0) > 0) return true  // 찾음
    } catch { continue }
  }
  return false
}
