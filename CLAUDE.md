# 소리숲 (SUP) — 작업 인계 문서

KUCC 동아리 해커톤(주제: 소리, 4인 팀) 출품작. 응답과 주석은 한국어로 작성한다.

- 슬로건: "말하지 않아도 괜찮아, 우리의 하루는 소리로 피어나."
- 기획: `docs/SUP_PRD_EN.md` (영문 PRD)
- 통합 브랜치: `feat/integrate` (emotion-server, stt-flowerword, 3d, soop-app을 합침)

## 1. 컨셉

두 사람이 하루 10초의 소리를 주고받으면, 그 소리가 **한국어 의성어 이름을 가진 꽃**으로 피어 둘만의 **3D 떠 있는 섬**을 채운다.

## 2. 확정된 결정

- 녹음 전에 **사람 목소리 / 다른 소리**를 고른다.
- **목소리**: 감정 분석 서버(HuBERT, `server/`) 결과로 감정 꽃 7종(기쁨·신남·설렘·포근함·차분함·울적함·긴장) 중 하나를 고른다. 서버가 응답하지 않으면 사용자가 감정을 직접 고른다. STT 문장은 **꽃말**이 된다.
- **다른 소리**: YAMNet 분류를 **쓰지 않는다**. 크기·밝기·세기·리듬·파형만으로 의성어(톡/토독/타닥 …)를 고른다.
- 음상 규칙: 크고 낮은 소리 = 음성모음, 어택 강함 = 뾰족한 꽃잎, onset 수 = 꽃잎 수(3~8), 파형 윤곽 = 꽃잎별 길이.
- **우리의 꽃**: 같은 날 두 사람이 모두 보내면 각자 그날 첫 꽃끼리 합성 꽃이 핀다(첫 두 음절씩 이어 붙임). 누르면 상대 소리는 왼쪽, 내 소리는 오른쪽 귀로 동시 재생.
- 점수·연속 기록·시들기 없음. 연결은 회원가입 없이 **6자리 정원 코드, 2명**.
- 화면 이름은 "소리숲", 영문·패키지명은 SUP (`com.sup.app`).

## 3. 기술 스택

- React 18 + Vite 5 (모바일 웹) → **Capacitor 8**로 Android/iOS 앱
- three.js (R3F 아님): `src/components/Island3D.jsx`
- Supabase: 익명 로그인, Postgres + RLS, 비공개 Storage(`sounds`), Realtime
- 감정 분석: Python FastAPI + HuBERT (`server/`), 앱은 `VITE_EMOTION_API_URL`로 호출
- STT: 브라우저는 Web Speech API(녹음과 동시), 앱은 `@capacitor-community/speech-recognition`(미리보기에서 '말로 적기')

## 4. 파일 지도

| 파일 | 내용 |
|---|---|
| `src/lib/soundFeatures.js` | RMS·centroid·attack·onset·sustain·envelope 추출, `THRESHOLDS` |
| `src/lib/flower.js` | 감정 꽃 7종 사전, `voiceCategory()`, `buildFlower()`(목소리), `buildSoundFlower()`(다른 소리) |
| `src/lib/emotion.js` | 감정 분석 서버 호출 |
| `src/lib/naming.js` | `pairName()`, `toFlowerRow()`(꽃 객체 → DB 행), `categoryLabel()` |
| `src/lib/audio.js` | 녹음 포맷, 파형 피크, 스테레오 재생 |
| `src/lib/stt.js` | 꽃말 STT (웹/앱 분기) |
| `src/lib/db.js` | Supabase: 정원 만들기/입장, 업로드, signed URL, 우리의 꽃 생성, 실시간 구독 |
| `src/components/Garden.jsx` | 홈(섬, 하단 카드, 탭: 정원·앨범·친구·나), 오늘의 위로 |
| `src/components/Island3D.jsx` | 떠 있는 섬과 꽃. 상대 꽃 왼쪽, 내 꽃 오른쪽, 우리의 꽃 가운데 |
| `src/components/Recorder.jsx` | 녹음 → 분석 → 미리보기 → 보내기 |
| `src/components/Details.jsx` | 꽃 상세, 우리의 꽃(좌우 파형 + 스테레오) |
| `src/components/Flower.jsx` | 2D SVG 꽃 (앨범·미리보기) |
| `src/components/Flower3D.jsx`, `src/lib/onomatopoeia.js` | **보관용**(feat/3d). 현재 import하지 않음 |
| `supabase/schema.sql` | 전체 스키마. 기존 DB에는 `supabase/migrations-002.sql` 추가 실행 |
| `server/` | 감정 분석 서버 |

## 5. 남은 작업

1. `THRESHOLDS`(soundFeatures.js)를 샘플 20개 녹음으로 다시 잡기
2. 감정 서버 배포 위치 정하기(노트북 + ngrok 등). 앱(https)에서는 http 주소를 못 부르니 https 주소 필요
3. Vercel 배포 → `capacitor.config.json`에 `server.url`을 넣어 앱이 배포본을 불러오게
4. P1: 소리 도감

## 6. 주의할 점

- 감정 분석 서버가 꺼져 있으면 목소리 꽃은 감정을 직접 골라야 한다. 시연 전 서버 상태를 꼭 확인할 것.
- iOS는 Mac + Xcode + CocoaPods 필요(음성 인식 플러그인이 SPM 미지원).
- 같은 브라우저 안에서는 익명 계정이 공유되므로 두 사람 테스트는 다른 브라우저/시크릿 창으로.
