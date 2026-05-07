export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const SSID = process.env.SPREADSHEET_ID
  const CE   = process.env.SHEETS_CLIENT_EMAIL
  const PK   = process.env.SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!SSID || !CE || !PK) return res.status(200).json({ rows: [] })

  try {
    const token = await getToken(CE, PK)
    const resp  = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SSID}/values/Sheet1!A1:Z1000`,
      { headers: { Authorization: 'Bearer ' + token } }
    )
    const data = await resp.json()
    const rows = (data.values || []).slice(1)
    return res.status(200).json({ rows })
  } catch (err) {
    return res.status(200).json({ rows: [], error: err.message })
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
