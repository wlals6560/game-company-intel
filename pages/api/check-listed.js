import { unzipSync } from 'zlib'

// 전체 DART 기업 목록 캐시 (서버리스 warm 상태에서 재사용)
let dartCorpCache = null
let dartCacheTime = 0
const CACHE_TTL = 1000 * 60 * 60 * 24 // 24시간

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { company } = req.body
  if (!company) return res.status(400).json({ error: '게임사명 필요' })

  const dartKey = process.env.DART_API_KEY

  const [dartResult, secResult] = await Promise.allSettled([
    checkDartByCorpList(company, dartKey),
    checkSecMulti(company),
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

// DART 전체 기업 목록 다운로드 후 포함 검색
async function checkDartByCorpList(company, dartKey) {
  if (!dartKey) return null
  try {
    // 캐시 확인
    if (!dartCorpCache || Date.now() - dartCacheTime > CACHE_TTL) {
      const res = await fetch(
        `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${dartKey}`
      )
      if (!res.ok) return null

      const buf = await res.arrayBuffer()
      const zipBuf = Buffer.from(buf)

      // ZIP 내 XML 파싱
      const unzipped = unzipSync(zipBuf)
      const xml = unzipped.toString('utf-8')

      // XML에서 corp_name 목록 추출
      const names = []
      const regex = /<corp_name>(.*?)<\/corp_name>/g
      let match
      while ((match = regex.exec(xml)) !== null) {
        names.push(match[1].trim())
      }
      dartCorpCache = names
      dartCacheTime = Date.now()
    }

    // 입력값이 법인명에 포함되는지 검색 (양방향)
    const input = company.trim().toLowerCase()
    const found = dartCorpCache.some(name => {
      const n = name.toLowerCase()
      return n.includes(input) || input.includes(n.replace(/^(주식회사\s*|\(주\)\s*|㈜\s*)/, '').replace(/\s*(주식회사|\(주\)|㈜)$/, '').trim())
    })

    return found
  } catch (e) {
    console.error('DART corp list error:', e.message)
    return null
  }
}

// SEC EDGAR 포함 검색
async function checkSecMulti(company) {
  const raw = company.trim()
  // 영문 변형 생성
  const variants = new Set([
    raw, raw.toLowerCase(), raw.toUpperCase(),
    raw.replace(/\s*(Inc\.?|Corp\.?|Co\.?,?\s*Ltd\.?|Games|Entertainment|Interactive|Studio|Studios)$/i, '').trim(),
  ])

  for (const variant of variants) {
    if (!variant) continue
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
