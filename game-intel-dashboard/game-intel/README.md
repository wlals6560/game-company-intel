# 게임사 인텔리전스 대시보드

## Vercel 배포 방법

### 1. GitHub에 올리기
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/game-intel-dashboard.git
git push -u origin main
```

### 2. Vercel 연결
1. vercel.com 접속 → New Project
2. GitHub 레포 선택
3. **Environment Variables** 설정 (아래 4개 필수):

| 변수명 | 값 |
|--------|-----|
| `ANTHROPIC_API_KEY` | Anthropic Console에서 발급한 API 키 |
| `SPREADSHEET_ID` | `1TV0tJAMlwQlFL3vsvVpIHlR2kjmd4PzeZLFyntrWnI0` |
| `SHEETS_CLIENT_EMAIL` | `sheets@business-intel-dashboard.iam.gserviceaccount.com` |
| `SHEETS_PRIVATE_KEY` | Service Account JSON의 `private_key` 값 전체 (따옴표 포함) |

4. Deploy 클릭

### 3. Anthropic API 키 발급
1. https://console.anthropic.com 접속
2. API Keys → Create Key
3. 복사해서 Vercel 환경변수에 입력

### 로컬 테스트
```bash
npm install
# .env.local 파일에 환경변수 입력 후
npm run dev
# http://localhost:3000 접속
```
