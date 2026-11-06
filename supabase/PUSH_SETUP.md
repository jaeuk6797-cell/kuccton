# 소리 도착 푸시 알림 서버 적용

웹 배포만으로는 푸시가 발송되지 않는다. 아래 작업은 **Supabase 프로젝트 관리 권한이 있는 팀원**이 한 번 적용한다. 앱은 `나 → 소리 도착 알림 → 켜기`에서 기기마다 구독한다. Android Chrome·삼성 인터넷과 iPhone/iPad의 홈 화면 웹앱(iOS/iPadOS 16.4 이상)을 지원한다. 기기의 알림 허용이 필요하다.

## 1. DB 준비

Supabase SQL Editor에서 기존 마이그레이션 다음에 `supabase/migrations-013.sql`을 실행한다. 구독 테이블, 수신 소리 INSERT 트리거, 비동기 `pg_net` 요청을 추가한다. Vault는 Supabase 기본 Vault를 사용한다. 비활성화된 프로젝트라면 Dashboard에서 Vault를 먼저 활성화한다.

구독 엔드포인트와 키는 클라이언트에서 읽을 수 없고, 인증된 Edge Function만 저장·삭제한다. 서버 설정을 아직 하지 않았거나 푸시가 실패해도 원래 소리 공유는 계속 동작한다.

## 2. 서버 키 한 번 생성

저장소의 `sup-app` 디렉터리에서 Node.js로 실행한다. 프로젝트 ref는 Supabase Dashboard URL의 `/project/` 뒤 식별자다. 이메일은 프로젝트 운영자의 실제 연락처를 사용한다.

```sh
node scripts/create-push-config.mjs PROJECT_REF mailto:운영자이메일
```

출력에는 파일 경로 두 개만 나온다.

- `envFile`: VAPID 공개키·개인키, 연락처, 웹훅 전용 비밀키를 담은 임시 `.env`.
- `sqlFile`: 위 비밀키와 함수 주소를 Supabase Vault에 등록하는 임시 `vault.sql`.

두 파일은 시스템 임시 폴더에 본인만 읽도록 생성된다. **내용을 GitHub에 커밋하거나 채팅에 붙이지 않는다.** 키는 안전하게 보관하고 이후 배포 때 재생성하지 않는다. VAPID 키를 변경하면 기존 기기에서 알림을 껐다가 다시 켜야 한다.

## 3. Edge Function 배포

Supabase CLI를 사용할 수 있는 팀원 계정으로 로그인한다. `ENV_FILE_PATH`는 방금 출력된 `envFile`의 실제 경로로 바꾼다.

```sh
npx supabase login
npx supabase secrets set --project-ref PROJECT_REF --env-file ENV_FILE_PATH
npx supabase functions deploy sound-push --project-ref PROJECT_REF --no-verify-jwt
```

`--no-verify-jwt`는 DB 트리거도 같은 함수로 들어오기 위해 필요하다. 함수는 브라우저 요청을 `auth.getUser(token)`으로 검증하고, 발송 요청은 별도의 `PUSH_HOOK_SECRET`으로 검증한다. 인증 없이 구독을 저장하거나 알림을 발송할 수 없다. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 Edge Function의 기본 서버 환경변수를 사용하며 프런트엔드에는 넣지 않는다.

Dashboard만 사용한다면 함수 폴더의 `index.ts`, `validation.js` 두 파일을 `sound-push` 함수에 넣고, JWT 플랫폼 검사를 끈 뒤 Secrets에 생성된 `.env`의 네 값을 등록해도 된다.

## 4. DB에서 함수 연결

생성된 `vault.sql` 내용을 **Supabase SQL Editor**에서 실행한다. 아래 두 Vault 이름이 생성되거나 갱신된다.

- `sup_push_function_url`: `https://PROJECT_REF.supabase.co/functions/v1/sound-push`
- `sup_push_hook_secret`: Edge Function의 `PUSH_HOOK_SECRET`과 같은 값

이 설정을 마치면 `shares`에 `pending` 소리가 새로 생길 때 수신자의 등록된 기기들로 푸시가 발송된다. 앱을 열어둔 브라우저에 의존하지 않는다. 예전 소리나 정원에 다시 심는 동작은 푸시를 보내지 않는다. 만료·해제된 구독(404/410)은 자동 제거한다. 일시적인 제공자 오류는 Edge Function 로그에서 확인한다. 네트워크·OS 정책에 따라 알림은 지연될 수 있으며 완전한 재시도 큐는 포함하지 않는다.

## 5. 실제 기기 확인

1. 최신 웹 배포를 열고 로그인한다.
2. **나 → 소리 도착 알림 → 켜기**를 누르고 시스템 알림을 허용한다. 서버 적용 전에는 준비 중으로 표시된다.
3. iPhone/iPad는 Safari의 **홈 화면에 추가**로 설치한 SUP에서 켠다. Android는 지원되는 Chrome·삼성 인터넷에서 켠다. Capacitor WebView 앱의 네이티브 푸시는 이 웹 푸시와 별도다.
4. 앱을 백그라운드로 보내거나 화면을 잠근다. 다른 계정에서 새 소리를 보낸다.
5. SUP 알림이 오고, 누르면 받은 소리함이 열리는지 확인한다. 서버가 보낸 원문·이메일은 잠금 화면에 표시하지 않는다.
6. 알림을 끄거나 로그아웃한 기기에는 더 이상 오지 않는지 확인한다.

GitHub Pages(`/kuccton/`)와 Vercel은 서로 다른 사이트이므로 기기별로 쓰는 주소에서 알림을 켠다. 워커는 각 배포의 하위 경로에 맞게 등록되며 웹 파일을 캐시하지 않는다.

## 코드 검증

```sh
node --test scripts/push.test.mjs
npx --yes --package deno -- deno test --no-lock --node-modules-dir=none --allow-env supabase/functions/sound-push/encryption_test.ts
npx --yes --package deno -- deno check --no-lock --node-modules-dir=none supabase/functions/sound-push/index.ts
npm run build
```

참고: [Apple Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Samsung Web Development Guide](https://developer.samsung.com/browser/android/web-developer-guide.html), [Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks).
