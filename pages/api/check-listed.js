export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { company } = req.body
  if (!company) return res.status(400).json({ error: '게임사명 필요' })

  const dartKey = process.env.DART_API_KEY
  const variants = getSearchVariants(company)

  const [dartResult, secResult] = await Promise.allSettled([
    checkDartMulti(variants, dartKey),
    checkSecMulti(variants),
  ])

  const dartFound = dartResult.status === 'fulfilled' ? dartResult.value : null
  const secFound  = secResult.status  === 'fulfilled' ? secResult.value  : null

  if (dartFound === true || secFound === true) {
    return res.status(200).json({ is_unlisted: false, in_dart: dartFound === true, in_sec: secFound === true })
  }
  if (dartFound === null || secFound === null) {
    return res.status(200).json({ is_unlisted: false, check_failed: true })
  }
  return res.status(200).json({ is_unlisted: true, in_dart: false, in_sec: false })
}

function getSearchVariants(company) {
  const variants = new Set()
  const raw = company.trim()

  // 원본 및 대소문자 변형
  variants.add(raw)
  variants.add(raw.toLowerCase())
  variants.add(raw.toUpperCase())

  // 접두사/접미사 제거 → 순수 이름 추출
  const stripped = raw
    .replace(/^(주식회사\s*|\(주\)\s*|\(주\)|㈜\s*|㈜)/, '')
    .replace(/\s*(주식회사|\(주\)|㈜)$/, '')
    .trim()

  if (stripped && stripped !== raw) {
    variants.add(stripped)
    variants.add(stripped.toLowerCase())
  }

  // 영문 suffix 제거
  const noSuffix = raw
    .replace(/\s*(Inc\.?|Corp\.?|Co\.?,?\s*Ltd\.?|Games|Entertainment|Interactive|Studio|Studios)$/i, '')
    .trim()
  if (noSuffix && noSuffix !== raw) {
    variants.add(noSuffix)
    variants.add(noSuffix.toLowerCase())
  }

  // DART 앞부분 일치 대응 — 접두사 붙인 변형 추가
  const base = stripped || noSuffix || raw
  variants.add('주식회사 ' + base)   // 주식회사 크래프톤
  variants.add(base + ' 주식회사')   // 크래프톤 주식회사
  variants.add('(주)' + base)        // (주)크래프톤
  variants.add('(주) ' + base)       // (주) 크래프톤
  variants.add(base + '(주)')        // 크래프톤(주)
  variants.add(base + ' (주)')       // 크래프톤 (주)
  variants.add('㈜' + base)          // ㈜크래프톤
  variants.add('㈜ ' + base)         // ㈜ 크래프톤
  variants.add(base + '㈜')          // 크래프톤㈜
  variants.add(base + ' ㈜')         // 크래프톤 ㈜

  // 공백 제거
  variants.add(raw.replace(/\s/g, ''))

  return [...variants].filter(v => v.length >= 1)
}

async function checkDartMulti(variants, dartKey) {
  if (!dartKey) return null
  for (const variant of variants) {
    try {
      const res = await fetch(
        `https://opendart.fss.or.kr/api/company.json?crtfc_key=${dartKey}&corp_name=${encodeURIComponent(variant)}&page_no=1&page_count=5`
      )
      if (!res.ok) continue
      const data = await res.json()
      if (data.status === '000' && (data.list?.length || 0) > 0) return true
    } catch { continue }
  }
  return false
}

async function checkSecMulti(variants) {
  for (const variant of variants) {
    try {
      const res = await fetch(
        `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(variant)}%22&forms=10-K,20-F`,
        { headers: { 'User-Agent': 'game-intel-dashboard contact@example.com' } }
      )
      if (!res.ok) continue
      const data = await res.json()
      if ((data.hits?.hits?.length || 0) > 0) return true
    } catch { continue }
  }
  return false
}
