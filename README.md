# 소리숲 (SUP)

하루 10초의 소리를 주고받으면 의성어 이름을 가진 꽃으로 피어나는 두 사람만의 정원.
React + Vite 웹앱을 Capacitor로 감싸 Android/iOS 앱으로 빌드합니다. 서버는 Supabase, 목소리 감정 분석은 `server/`의 Python 서버를 씁니다.

## 1. Supabase 준비 (한 번만)

1. [supabase.com](https://supabase.com)에서 프로젝트 생성
2. **SQL Editor**에서 `supabase/schema.sql` 실행
   이미 이전 버전 스키마를 실행했다면 `supabase/migrations-002.sql`, `-003`, `-004`, `-005`, `-006`, `-007`(대화), `-008`(놀러 가기는 모양만), `-009`(소리 도착 알림)를 차례로 실행하면 됩니다.
   > ⚠️ **`migrations-006.sql`을 실행해야 친구 정원 놀러 가기가 동작합니다.** 친구 정원에는 *그 친구가 받아서 심은 소리*가 보이는데,
   > 받은 소리는 보낸 사람 정원에 저장되어 있어서 방문용 함수(`visit_flowers`)와 소리 파일 읽기 권한이 따로 필요합니다.
   > 실행 전에는 놀러 가기 화면에 "서버 준비가 아직 안 됐어요 (Supabase에서 migrations-006.sql 실행 필요)"가 나옵니다.
3. **Authentication → Sign In / Providers → Email** 켜기. 해커톤 동안은 **Confirm email을 꺼 두세요**(기본 메일 발송은 시간당 몇 통으로 제한되고, 확인 링크를 눌러야 로그인됩니다). 로그인은 필수이며 익명 로그인은 쓰지 않습니다.
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
두 사람 테스트는 계정 두 개로, **다른 브라우저나 시크릿 창**에서 각각 로그인하세요.

## 4. 폰에 설치

- **Android**: 폰에서 아래 링크를 열어 APK를 받고 설치합니다. 처음 한 번은 '출처를 알 수 없는 앱 설치'를 허용해야 합니다.
  https://github.com/jaeuk6797-cell/kuccton/releases/download/android-latest/sup.apk
  `android/`나 앱 설정이 바뀌면 GitHub Actions가 자동으로 다시 빌드합니다(Actions 탭에서 수동 실행도 가능). 화면·기능은 앱이 배포본을 불러오므로 다시 설치할 필요가 없습니다.
- **iPhone / Android 공통**: https://kuccton.vercel.app 을 열고 '홈 화면에 추가'해도 같은 앱처럼 쓸 수 있습니다.

## 5. 앱 직접 빌드 (Capacitor)

`.env` 값은 빌드할 때 앱에 들어가므로 먼저 채워 두세요.

- **Android** (Android Studio 필요): `npm run android` → 폰 연결 후 ▶ Run
- **iOS** (Mac + Xcode + CocoaPods): `npm run ios` → Signing에서 Team 선택 후 ▶
- 웹 코드만 바꿨다면 `npm run cap:sync`

### 실시간 수정
`capacitor.config.json`의 `server.url`이 배포 주소(https://kuccton.vercel.app)를 가리킵니다.
설치된 앱은 이 주소를 불러오므로, `main`에 푸시하면 Vercel이 다시 배포하고 앱에도 바로 반영됩니다(앱 재빌드 불필요).
인터넷 연결이 필요하니 시연장에서는 핫스팟을 준비하세요. 오프라인 빌드가 필요하면 `server` 항목을 지우고 `npm run cap:sync` 하면 됩니다.

## 6. 꽃이 피는 규칙

녹음 전에 **사람 목소리 / 다른 소리**를 고릅니다.

| | 목소리 | 다른 소리 |
|---|---|---|
| 꽃 종류 | 감정 분석 → 감정 꽃 7종 (깔깔, 콩닥콩닥, 도란도란 …) | 분류 없이 소리 특징만으로 (톡, 토독, 타닥, 살랑 …) |
| 변형 | onset 수 → 단일/기본/첩어, 크고 낮으면 음성모음, 어택 강하면 거센소리 | 리듬 × 세기 × 모음, 길게 이어지면 살랑·웅웅 |
| 꽃말 | STT 문장 | 없음 |

공통: onset 수 = 꽃잎 수(3~8), 어택 강함 = 뾰족한 꽃잎, 파형 윤곽 = 꽃잎별 길이.
같은 날 두 사람이 모두 보내면 **우리의 꽃**이 피고, 누르면 상대 소리는 왼쪽·내 소리는 오른쪽 귀로 동시에 들립니다.

자세한 구조는 [CLAUDE.md](CLAUDE.md)를 보세요.

## 6. 글꼴 출처

| 글꼴 | 쓰는 곳 | 출처 · 라이선스 |
|---|---|---|
| **교보 손글씨 2024 박서우** | 꽃말 (`public/fonts/KyoboHandwriting2024psw.ttf`) | © 교보문고 · 제작 윤디자인. 제10회 교보손글씨대회 으뜸상 수상자 박서우 님의 손글씨. 개인·기업 무료 사용 가능(웹 포함). 파일 수정·변환·재판매 금지. [교보문고 손글씨 폰트](https://store.kyobobook.co.kr/handwriting/font) |
| **Pretendard** | 그 밖의 모든 글자 | © Kil Hyung-jin · [SIL Open Font License 1.1](https://github.com/orioncactus/pretendard/blob/main/LICENSE) · jsDelivr CDN으로 불러옴 |

## 7. 소리 도착 푸시 알림 (Supabase만 사용)

친구가 소리를 보내면 받는 사람 기기로 "○○이 소리를 보냈어요" 알림이 가고, 누르면 받은 소리함이 열립니다.
Firebase 없이 **웹 푸시**를 씁니다: `shares`에 행이 생기면 DB 트리거(`migrations-009.sql`)가 Edge Function(`supabase/functions/notify-share`)을 부르고, 함수가 브라우저 푸시 서버로 보냅니다.

- 받을 수 있는 곳: 아이폰은 **홈 화면에 추가한 소리숲**(iOS 16.4 이상), Android·PC는 크롬 등 브라우저
- **Capacitor 앱(APK) 안에서는 받을 수 없습니다**(WebView가 웹 푸시를 지원하지 않음). 앱의 '나' 화면에 안내가 나옵니다.
- 각자 **메뉴 → 나 → 알림 켜기**를 눌러야 그 기기로 옵니다.

설정 (한 번만):
1. VAPID 키 한 쌍 만들기: `npx web-push generate-vapid-keys`
2. **Edge Functions**에 `notify-share` 배포 — `supabase/functions/notify-share/index.ts` 내용으로, **JWT 검증은 끄고**
   (CLI: `supabase functions deploy notify-share --no-verify-jwt`, 또는 Dashboard → Edge Functions → 새 함수에 붙여넣고 *Enforce JWT verification* 끄기)
3. **Edge Functions → Secrets**에 추가: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_SECRET`(아무 긴 무작위 문자열)
4. **SQL Editor**에서 Vault 비밀값을 넣고 `supabase/migrations-009.sql` 실행
   ```sql
   select vault.create_secret('https://xxxx.supabase.co', 'project_url');
   select vault.create_secret('<3번의 PUSH_SECRET과 같은 값>', 'push_secret');
   ```
5. Vercel(과 `.env`)에 `VITE_VAPID_PUBLIC_KEY=<1번의 공개 키>` 넣고 다시 배포. 이 값이 없으면 알림 메뉴가 보이지 않습니다.

안 올 때: Edge Functions → notify-share → Logs, 그리고 SQL `select * from net._http_response order by created desc limit 5;`로 트리거 호출 결과를 확인하세요.
