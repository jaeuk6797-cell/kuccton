# SUP — 작업 인계 문서

KUCC 동아리 해커톤(주제: 소리, 4인 팀) 출품작. 응답과 주석은 한국어로 작성한다.

- 슬로건: "말하지 않아도 괜찮아, 우리의 하루는 소리로 피어나."
- 기획: `docs/SUP_PRD_EN.md` (영문 PRD)
- 통합 브랜치: `feat/integrate` (emotion-server, stt-flowerword, 3d, soop-app을 합침)

## 1. 컨셉

두 사람이 하루 10초의 소리를 주고받으면, 그 소리가 **한국어 의성어 이름을 가진 꽃**으로 피어 둘만의 **3D 떠 있는 섬**을 채운다.

## 2. 확정된 결정

- 녹음 버튼은 하나. 녹음 중 받아쓰기로 글자가 들리면 **사람 목소리**, 아니면 **다른 소리**로 스스로 정한다(앱은 받아쓰기를 못 해 다른 소리).
- **목소리**: 감정 분석 서버(HuBERT, `server/`) 결과로 감정 꽃 7종(기쁨·신남·설렘·포근함·차분함·울적함·긴장) 중 하나를 고른다. 서버가 응답하지 않으면 사용자가 감정을 직접 고른다. STT 문장은 **꽃말**이 된다.
- **다른 소리**: YAMNet 분류를 **쓰지 않는다**. 크기·밝기·세기·리듬·파형만으로 의성어(톡/토독/타닥 …)를 고른다.
- 음상 규칙: 크고 낮은 소리 = 음성모음, 어택 강함 = 뾰족한 꽃잎, onset 수 = 꽃잎 수(3~8), 파형 윤곽 = 꽃잎별 길이.
- **우리의 꽃**: 같은 날 두 사람이 모두 보내면 각자 그날 첫 꽃끼리 합성 꽃이 핀다(첫 두 음절씩 이어 붙임). 누르면 상대 소리는 왼쪽, 내 소리는 오른쪽 귀로 동시 재생.
- 점수·연속 기록·시들기 없음. **이메일+비밀번호 로그인 필수**. **각자 자기 정원**을 갖고, 친구 코드(= 정원 코드)로 **여러 친구**를 맺는다. **내 소리는 내 정원에 피지 않는다.** 오늘의 소리를 녹음하면 **받을 친구를 여러 명 골라 보내고**, 그 소리는 친구 정원에 핀다. **내 정원 = 친구들이 보내 준 소리**(받은 소리함에 먼저 오고 '정원에 심기/괜찮아요'를 고른 뒤 심은 것)만. 같은 날 서로 보낸 소리를 둘 다 심으면 두 정원 모두에 우리의 꽃이 핀다. 소리 앨범도 받은 소리와 우리의 꽃만 보여 준다. 공개/비공개 설정은 없다. 친구면 누구나 친구 화면에서 정원에 놀러 가 **그 친구가 받아서 심은 소리를 모양만** 구경할 수 있고, 소리는 들을 수 없다(`visit_flowers`가 audio_path·transcript를 빼고 준다, migrations-008). 친구 화면에는 대화 대신 **주고받은 소리 기록**(받음/보냄·날짜·상태)만 보이고, 프로필 아래 ‘정원 보기’를 누르면 그 친구 정원에 놀러 간다. 친구 화면(소리 상세 포함)에는 공유 버튼을 두지 않는다(`Chat.jsx`·migrations-007은 남아 있지만 화면에서 쓰지 않음)(`db.js`의 `derivePairs`, `pair_flowers` 테이블은 더 이상 쓰지 않음). 나 탭에서 **프로필 사진·닉네임**을 바꿀 수 있다(`updateProfile` → `update_profile` RPC, 사진은 256px로 줄여 공개 버킷 `avatars/<user id>/`에, migrations-009). 프로필 동그라미는 `Avatar.jsx`로 그린다.
- 서비스 이름은 **SUP** 하나만 쓴다(화면·앱 이름·패키지 `com.sup.app` 모두). "소리숲"은 쓰지 않는다.

- 정원은 **최대 50송이**(`GARDEN_LIMIT`, DB `respond_share`와 같아야 함). 상시 용량 안내는 없고, 50송이 상태에서 추가 심기를 시도할 때만 2초 중앙 알림을 띄운다. 앨범 상세에서 소리를 정원에 심거나 빼고, 자신의 수신 항목을 삭제한다(`archive_shares`, 상태 `archived`, 앨범에는 '정리함'으로 남음, migrations-010). 섬에는 반지름 3.4·간격 0.66 벌집 자리 69개를 장식(고리·수정·연못)을 피해 깔고, 먼저 받은 꽃부터 자리를 잡아 새 꽃이 와도 기존 꽃은 움직이지 않는다(`Island3D.jsx`의 `SLOTS`, `placeFlowers`).

- 받은 소리함에는 `pending`만 보인다. 심었거나 `declined`(괜찮아요)인 소리도 친구별 수신 내역(`receivedHistory`)에는 남긴다. 친구 → 해당 친구 → 주고받은 소리에서 다시 듣고, `declined`는 다시 심을 수 있다. 정원·우리의 꽃에는 `accepted`만 사용하고 `archived`는 앨범에 유지한다. `migrations-011.sql` 실행 후 거절·정리한 소리도 다시 심을 수 있다.

- 도움말은 앱 취지와 작은 ‘튜토리얼 다시 하기’만 보여 준다. 정원을 처음 만든 직후(`session.justCreated`) `Tutorial.jsx`의 알림 설정을 포함한 6단계 안내를 연다. 완료·건너뛰기로 닫고 도움말에서 다시 열 수 있다. 데모는 `tutorial=1`일 때만 연다.

## 3. 기술 스택

- React 18 + Vite 5 (모바일 웹) → **Capacitor 8**로 Android/iOS 앱
- three.js (R3F 아님): `src/components/Island3D.jsx`
- Supabase: 이메일 로그인, Postgres + RLS, 비공개 Storage(`sounds`), Realtime
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
| `src/lib/db.js` | Supabase: 로그인·가입, 내 정원 찾기, 정원 만들기, 친구 맺기(`addFriend`), 소리 공유(`shareFlowers`), 우리의 꽃 계산(`derivePairs`), 업로드, signed URL, 우리의 꽃 생성, 실시간 구독 |
| `src/components/Garden.jsx` | 홈(섬, 하단 카드, 탭: 정원·앨범·친구·나), 오늘의 위로 |
| `src/components/Island3D.jsx` | 떠 있는 섬과 꽃. 상대 꽃 왼쪽, 내 꽃 오른쪽, 우리의 꽃 가운데 |
| `src/components/Recorder.jsx` | 녹음 → 분석 → 미리보기 → 보내기 |
| `src/components/Details.jsx` | 꽃 상세, 우리의 꽃(좌우 파형 + 스테레오) |
| `src/components/Flower.jsx` | 2D SVG 꽃 (앨범·미리보기) |
| `src/components/Flower3D.jsx`, `src/lib/onomatopoeia.js` | **보관용**(feat/3d). 현재 import하지 않음 |
| `supabase/schema.sql` | 전체 스키마. 기존 DB에는 `supabase/migrations-002.sql` ~ `-009.sql`을 차례로 추가 실행 (007 대화, 008 놀러 가기는 모양만, 009 프로필 사진·닉네임) |
| `server/` | 감정 분석 서버 |

## 5. 남은 작업

1. `THRESHOLDS`(soundFeatures.js)를 샘플 20개 녹음으로 다시 잡기
2. 감정 서버 배포 위치 정하기(노트북 + ngrok 등). 앱(https)에서는 http 주소를 못 부르니 https 주소 필요
3. Vercel 배포 → `capacitor.config.json`에 `server.url`을 넣어 앱이 배포본을 불러오게
4. P1: 소리 도감

## 6. 주의할 점

- 감정 분석 서버가 꺼져 있으면 목소리 꽃은 감정을 직접 골라야 한다. 시연 전 서버 상태를 꼭 확인할 것.
- iOS는 Mac + Xcode + CocoaPods 필요(음성 인식 플러그인이 SPM 미지원).
- Supabase의 Confirm email이 켜져 있으면 가입 후 메일 확인 전까지 로그인이 안 된다. 해커톤 동안은 꺼 둘 것.
- 두 사람 테스트는 계정 두 개로 다른 브라우저/시크릿 창에서.

- 메인에는 접기·펼치기 없이 ‘오늘의 위로’·‘오늘의 소리 10초’를 항상 표시한다. 앨범의 정원 등록 여부는 그림 우상단 체크로만 표시한다. 수신 항목 삭제 권한은 migrations-012.sql을 실행해야 한다.

- 웹 푸시는 `public/sw.js`, `src/lib/push.js`, `PushSettings.jsx`와 Supabase `sound-push` 함수로 처리한다. 갤럭시 지원 브라우저와 iOS 16.4+ 홈 화면 앱에서 나 탭의 ‘소리 도착 알림’을 직접 켠다. DB 수신 INSERT가 발송하며 앱이 열려 있을 필요는 없다. migrations-013.sql·Edge Function·VAPID 및 Vault 설정 필요(`supabase/PUSH_SETUP.md`). 로그아웃 시 기기 구독을 해제한다. 워커에는 fetch 캐시가 없다. 실제 두 기기 수신 검증은 서버 설정 후 진행한다.

- 소리 UI는 `SoundPlayer.jsx`(숨긴 audio + 재생/일시정지·시간)로 통일한다. 우리의 꽃은 `audioLevel.js`의 `stereoWave`로 상대·나를 각각 왼쪽·오른쪽에 넣은 단일 WAV를 만들어 같은 플레이어로 재생한다. Web Audio 실시간 2중 재생은 사용하지 않는다.

- 친구 최대 20명(`FRIEND_LIMIT`, migrations-014.sql). 양쪽 계정 한도를 DB 트리거에서도 검사한다. 초과한 기존 관계는 보존한다. 정원 상단 친구는 선택창의 핀으로 최대 3명, 기기·계정별 localStorage에 저장하며 검색칸은 두지 않는다.
- 앨범 5열 고정, 연월 선택(기본 최근 연월/전체 연도로 모든 기록). 받은 소리함은 내용만큼 커지고 기본 항목 3개 높이에 고정해 4개부터 내부 스크롤한다.

- 튜토리얼 첫 단계는 소리 도착 알림 설정이다. 사용자 버튼에서만 권한 요청하고 나중에 설정 가능하다. 핀 개수 상시 문구 대신 4번째 고정 시 중앙 알림, 앨범 날짜 옆에는 표시 항목 개수를 숫자로만 둔다.
