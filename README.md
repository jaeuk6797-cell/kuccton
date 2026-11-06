# 소리숲 (SUP)

하루 10초의 소리를 주고받으면 의성어 이름을 가진 꽃으로 피어나는 두 사람만의 정원.
React + Vite 웹앱을 Capacitor로 감싸 Android/iOS 앱으로 빌드합니다. 서버는 Supabase, 목소리 감정 분석은 `server/`의 Python 서버를 씁니다.

## 1. Supabase 준비 (한 번만)

1. [supabase.com](https://supabase.com)에서 프로젝트 생성
2. **SQL Editor**에서 `supabase/schema.sql` 실행
   이미 이전 버전 스키마를 실행했다면 `supabase/migrations-002.sql`만 실행하면 됩니다.
3. **Authentication → Sign In / Providers → Anonymous sign-ins** 켜기
4. `.env.example`을 `.env`로 복사하고 값 입력
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   VITE_EMOTION_API_URL=http://localhost:8000
   ```

## 2. 감정 분석 서버 (사람 목소리 꽃)

```bash
cd server
pip install -r requirements.txt     # torch, transformers 등. 처음 실행 때 모델을 내려받습니다
uvicorn server:app --host 0.0.0.0 --port 8000
```
- 브라우저 webm을 변환하려면 `ffmpeg`가 설치되어 있어야 합니다.
- 폰이나 앱에서 부르려면 https 주소가 필요합니다. 예: `ngrok http 8000` → 나온 주소를 `VITE_EMOTION_API_URL`에 입력.
- 서버가 꺼져 있으면 목소리 꽃은 감정을 직접 고르게 됩니다.

## 3. 개발 (브라우저)

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:phone    # 같은 와이파이의 폰에서 https://<PC IP>:5173
```
두 사람 테스트는 **다른 브라우저나 시크릿 창**으로 하세요. 같은 브라우저는 익명 계정이 공유됩니다.

## 4. 앱 빌드 (Capacitor)

`.env` 값은 빌드할 때 앱에 들어가므로 먼저 채워 두세요.

- **Android** (Android Studio 필요): `npm run android` → 폰 연결 후 ▶ Run
- **iOS** (Mac + Xcode + CocoaPods): `npm run ios` → Signing에서 Team 선택 후 ▶
- 웹 코드만 바꿨다면 `npm run cap:sync`

## 5. 꽃이 피는 규칙

녹음 전에 **사람 목소리 / 다른 소리**를 고릅니다.

| | 목소리 | 다른 소리 |
|---|---|---|
| 꽃 종류 | 감정 분석 → 감정 꽃 7종 (깔깔, 콩닥콩닥, 도란도란 …) | 분류 없이 소리 특징만으로 (톡, 토독, 타닥, 살랑 …) |
| 변형 | onset 수 → 단일/기본/첩어, 크고 낮으면 음성모음, 어택 강하면 거센소리 | 리듬 × 세기 × 모음, 길게 이어지면 살랑·웅웅 |
| 꽃말 | STT 문장 | 없음 |

공통: onset 수 = 꽃잎 수(3~8), 어택 강함 = 뾰족한 꽃잎, 파형 윤곽 = 꽃잎별 길이.
같은 날 두 사람이 모두 보내면 **우리의 꽃**이 피고, 누르면 상대 소리는 왼쪽·내 소리는 오른쪽 귀로 동시에 들립니다.

자세한 구조는 [CLAUDE.md](CLAUDE.md)를 보세요.
