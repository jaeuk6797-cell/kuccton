# 소리숲 (SUP)

하루 10초의 소리를 주고받으면 의성어 이름을 가진 꽃으로 피어나는 두 사람만의 정원.
React + Vite 웹앱을 Capacitor로 감싸 Android / iOS 앱으로 빌드하고, 서버는 Supabase 하나만 씁니다.

## 1. Supabase 준비 (한 번만)

1. [supabase.com](https://supabase.com)에서 프로젝트 생성
2. **SQL Editor**에 `supabase/schema.sql` 전체를 붙여 넣고 실행
   (테이블, RLS, 방 만들기/입장 함수, 비공개 `sounds` 버킷, Realtime 설정)
3. **Authentication → Sign In / Providers → Anonymous sign-ins** 켜기
4. `.env.example`을 `.env`로 복사하고 **Project Settings → API**의 값 입력
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

## 2. 개발 (브라우저)

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:phone    # 같은 와이파이의 폰에서 https://<PC IP>:5173 (인증서 경고는 '계속')
```

두 사람 테스트: 같은 브라우저 안에서는 익명 계정이 하나로 공유되므로, **다른 브라우저나 시크릿 창**으로 두 번째 사람을 들어가게 하세요.

## 3. 앱 빌드 (Capacitor)

`.env`는 빌드할 때 앱에 들어가므로, 빌드 전에 먼저 채워 두세요.

### Android
필요: [Android Studio](https://developer.android.com/studio) (JDK 포함)

```bash
npm run android      # 웹 빌드 → 동기화 → Android Studio 열림
```
Android Studio에서 폰을 USB로 연결(개발자 옵션 → USB 디버깅)한 뒤 ▶ Run을 누르면 됩니다.
APK 파일이 필요하면 **Build → Build App Bundle(s) / APK(s) → Build APK(s)** 를 쓰세요.

### iOS
필요: Mac + Xcode + CocoaPods(`brew install cocoapods`; 음성 인식 플러그인 때문에 SPM 대신 CocoaPods 사용). 실제 아이폰에 설치하려면 Apple ID로 서명해야 합니다(무료 계정은 7일 동안 유효).

```bash
npm run ios          # Xcode 열림 → Signing & Capabilities에서 Team 선택 → ▶
```

웹 코드만 바꿨다면 `npm run cap:sync` 후 다시 실행하면 됩니다.

## 구조

| 파일 | 내용 |
|---|---|
| `src/lib/naming.js` | 의성어 사전 16개 카테고리, 음상 변형 규칙, 합성 꽃 이름, 꽃 외형. **임계값 `THRESHOLDS`는 샘플 20개를 녹음해서 조정** |
| `src/lib/audio.js` | RMS·spectral centroid·어택·onset 추출, 16kHz 리샘플, 스테레오 재생(상대 −0.8 / 나 +0.8) |
| `src/lib/classify.js` | YAMNet(tfjs). 모델은 `public/models/yamnet`에 내장되어 오프라인에서도 동작. 3초 안에 확실한 결과가 없으면 카테고리 직접 선택 |
| `src/lib/stt.js` | 꽃말. 브라우저는 녹음과 동시에 Web Speech, 앱은 미리보기 화면의 '말로 적기' 버튼(네이티브 음성 인식) |
| `src/lib/db.js` | Supabase: 익명 로그인, 방 코드, 업로드/signed URL, 우리의 꽃 생성, Realtime |
| `src/components/` | 입장(S1), 정원(S2), 녹음·미리보기(S3·S4), 꽃 상세(S5), 우리의 꽃(S6) |

## 알아 둘 점

- 앱에서는 녹음 중에 녹음기가 마이크를 쓰고 있어서, 꽃말은 녹음과 동시에 받아 적지 않고 미리보기에서 한 번 더 말해 받아 적습니다. 직접 입력도 됩니다.
- 우리의 꽃은 같은 날 두 사람이 각각 처음 보낸 꽃끼리 하루에 하나만 핍니다.
- P1(오늘의 위로, 소리 도감)은 아직 없습니다.
