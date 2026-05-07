export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { company } = req.body
  if (!company) return res.status(400).json({ error: '게임사명 필요' })

  const dartKey = process.env.DART_API_KEY

  const [dartResult, secResult] = await Promise.allSettled([
    checkDart(company, dartKey),
    checkSec(company),
  ])

  const inDart = dartResult.status === 'fulfilled' ? dartResult.value : false
  const inSec  = secResult.status  === 'fulfilled' ? secResult.value  : false

  return res.status(200).json({
    is_unlisted: !inDart && !inSec,
    in_dart: inDart,
    in_sec: inSec,
  })
}

async function checkDart(company, dartKey) {
  if (!dartKey) return false
  try {
    const res = await fetch(
      `https://opendart.fss.or.kr/api/company.json?crtfc_key=${dartKey}&corp_name=${encodeURIComponent(company)}&page_no=1&page_count=1`
    )
    if (!res.ok) return false
    const data = await res.json()
    return (data.list?.length || 0) > 0
  } catch { return false }
}

async function checkSec(company) {
  try {
    const res = await fetch(
      `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(company)}%22&forms=10-K,20-F`,
      { headers: { 'User-Agent': 'game-intel-dashboard contact@example.com' } }
    )
    if (!res.ok) return false
    const data = await res.json()
    return (data.hits?.hits?.length || 0) > 0
  } catch { return false }
}
