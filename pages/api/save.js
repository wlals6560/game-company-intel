export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { row } = req.body
  if (!row) return res.status(400).json({ error: 'row 데이터 필요' })

  const SSID = process.env.SPREADSHEET_ID
  const CE   = process.env.SHEETS_CLIENT_EMAIL
  const PK   = process.env.SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!SSID || !CE || !PK) {
    return res.status(500).json({ error: 'Sheets 환경변수 미설정' })
  }

  try {
    const token = await getToken(CE, PK)
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SSID}/values/Sheet1!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`

    // 헤더 없으면 추가
    const chk = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SSID}/values/Sheet1!A1`,
      { headers: { Authorization: 'Bearer ' + token } }
    )
    const cd = await chk.json()
    if (!cd.values) {
      await fetch(url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [['수집일시','게임사','요약','요약포인트','요약태그','뉴스','재무','인력','채용','소싱','시그널태그','계기판','알림레벨']] }),
      })
    }

    await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] }),
    })

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

async function getToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000)
  const enc = s => Buffer.from(JSON.stringify(s)).toString('base64url')
  const header  = enc({ alg: 'RS256', typ: 'JWT' })
  const payload = enc({ iss: clientEmail, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now })
  const toSign  = header + '.' + payload

  const { createSign } = await import('crypto')
  const sign = createSign('SHA256')
  sign.update(toSign)
  const sig = sign.sign(privateKey, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const jwt = toSign + '.' + sig

  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('토큰 발급 실패')
  return data.access_token
}
