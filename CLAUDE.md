# 소리숲 (SOOP) — 작업 인계 문서

> 이 문서는 `feat/3d`에서 작성한 초기 기획과 작업 기록입니다. 현재 `main`의 실행 방법과 통합 기준은 [README](README.md)와 [통합 가이드](docs/INTEGRATION.md)를 참고하세요.

KUCC 동아리 해커톤(주제: 소리, 4인 팀, 6~12시간) 출품작. Cowork에서 기획하고 일부 코드를 작성한 뒤 Claude Code로 넘겨받은 상태.
응답과 주석은 한국어로 작성한다.

- PRD(전체 기획): https://claude.ai/artifact/16e2tL7on18hrktbpdS7yz
- 슬로건: "말하지 않아도 괜찮아, 우리의 섬은 소리로 자라나."

## 1. 컨셉 한 줄

두 사람이 하루 10초의 소리를 주고받으면, 그 소리가 **한국어 의성어 이름을 가진 꽃**(예: 토도독꽃, 소곤소곤꽃)으로 피어 둘만의 **3D 떠 있는 섬**을 채운다.

## 2. 확정된 결정 사항

- 목소리 녹음을 **제한하지 않는다**. 모든 소리는 이름 붙은 꽃이 된다.
- 목소리 꽃은 STT로 받아 적은 문장을 **꽃말**로 붙인다.
- 꽃 이름은 **카테고리 → 의성어 어근**, **음향 특징 → 음운 변형**(한국어 음상)으로 만든다.
  - 작고 밝은 소리 = 양성모음(졸졸) / 크고 낮은 소리 = 음성모음(줄줄)
  - 어택 약함·중간·강함 = 예사소리·된소리·거센소리 (감감/깜깜/캄캄)
  - onset 1개 / 2~3개 / 4개 이상 = 단일 / 기본 / 첩어
- **우리의 꽃**: 같은 날 두 사람이 모두 보내면 합성 꽃이 피고(토독+소곤 = 토독소곤꽃), 누르면 상대 소리는 왼쪽, 내 소리는 오른쪽 귀로 동시 재생(StereoPannerNode).
- 점수·연속 기록·시들기 없음.
- 연결은 회원가입 없이 **방 코드 2인**.

## 3. 3D 아트 디렉션 (Forest 앱 + 몽환적 떠 있는 섬)

레퍼런스: 분홍→보라→청록 그라데이션 하늘에 떠 있는 원형 섬. 구리빛 테두리 원판, 아래는 울퉁불퉁한 바위/물 덩어리, 위에 겹꽃잎 연꽃형 꽃, 투명한 크리스털, 뒤편에 거울 고리, 반짝이는 노란 입자, 나비.

웹 구현 매핑:
- 그라데이션 배경: CSS 그라데이션 + 투명 Canvas(`gl={{ alpha: true }}`) + fog
- 빛나는 느낌: `@react-three/postprocessing` Bloom (꽃 중심은 emissive, `toneMapped={false}`)
- 입자: drei `<Sparkles>`, 재생 중 음량에 반응
- 크리스털: drei `MeshTransmissionMaterial` 또는 `meshPhysicalMaterial` iridescence (모바일 성능 주의, dpr 상한 1.5)
- 섬 둥실: drei `<Float>`
- 카메라: 등각 시점 고정 + OrbitControls(회전·줌만, pan 금지)

소리숲 의미 부여:
- 거울 고리 = **소리의 문**: 우리의 꽃이 피면 빛나고, 누르면 스테레오 재생
- 크리스털 = 쌓인 시간: 주고받은 소리 수에 따라 하나씩 자람 (여유 시)
- 나비 = 목소리 꽃에서 날아오름, 누르면 꽃말 표시 (여유 시)
- 구역(zone): water(연못가: 비·물) / hill(언덕: 바람·새) / shade(그늘: 목소리·속삭임·노래) / sunny(잔디밭: 웃음·박수·동물) / path(오솔길: 생활음)

꽃 외형 매핑: 양성모음 = 작고 2겹, 음성모음 = 크고 3겹, 된소리·거센소리 = 뾰족한 꽃잎, onset 수 = 꽃잎 수(3~8), 음량 = 중심 발광 세기, 카테고리 = 색.

블렌더: 섬 원판+테두리, 바위 밑면(Icosphere + Displace(Clouds) + Decimate), 크리스털, 거울 고리만 모델링 → `public/models/island.glb`(Draco). 구역 위치는 Empty 오브젝트(`zone_water` 등)로 표시. 머티리얼은 코드에서 다시 입힌다. 꽃은 블렌더가 아니라 **코드로 절차 생성**.

## 4. 팀 역할

| 담당 | 역할 |
|---|---|
| 여정 + 친구 1명 | 3D (한 명은 블렌더 아트, 한 명은 R3F 씬·꽃 생성기·후처리) |
| 팀원 C | 소리·언어: 녹음, 특징 추출, YAMNet, 의성어 사전, STT |
| 팀원 D | Supabase, 방 코드, 실시간, 배포, 통합, 발표 |

## 5. 기술 스택

React 18 + Vite 5, three / @react-three/fiber 8 / drei 9 / postprocessing 2, @tensorflow/tfjs(YAMNet), Supabase(Postgres + Storage + Realtime), Vercel 배포(마이크 때문에 HTTPS 필수).

## 6. 꽃 데이터 계약

현재 공용 타입은 [`src/contracts/flower.js`](src/contracts/flower.js)입니다. 기존 `src/lib/analyze.js`의 `buildFlower()` 출력은 [통합 가이드](docs/INTEGRATION.md)에 따라 변환합니다.

## 7. 작성된 파일 (빌드 미검증)

Cowork 샌드박스에서 npm 레지스트리가 막혀 있어 **설치·실행을 한 번도 못 했다.** 첫 작업은 `npm install && npm run dev`로 확인하고 깨지는 곳부터 고칠 것.

| 파일 | 상태 | 내용 |
|---|---|---|
| `package.json`, `vite.config.js`, `index.html`, `.env.example`, `.gitignore` | 완료 | 기본 세팅 |
| `src/main.jsx` | 완료 | `App.jsx`, `styles.css` import (둘 다 아직 없음) |
| `src/lib/onomatopoeia.js` | 완료 | 카테고리 사전 17개, 임계값(`THRESHOLDS`), `nameFlower()`, `pairName()` |
| `src/lib/analyze.js` | 완료 | `decode()`, `extractFeatures()`(RMS·centroid·attack·onset, 자체 FFT), `buildFlower()` |
| `src/lib/classify.js` | 완료 | YAMNet 로드(TF Hub URL + 클래스맵 CSV), 표시명 → 카테고리 매핑, 실패 시 `confident:false` |
| `src/lib/recorder.js` | 완료 | 10초 MediaRecorder + Web Speech API(ko-KR) 동시 실행 |
| `src/lib/player.js` | 완료 | `playFlower()`, `playPair()`(좌 -0.8 / 우 +0.8), 재생 음량 콜백 |

## 8. 남은 작업 (우선순위 순)

1. **`src/lib/store.js`**: `listFlowers(room)`, `sendFlower(room, flower, blob)`, `subscribe(room, cb)`.
   - `.env`에 Supabase 값이 있으면 Supabase(Storage 비공개 버킷 `sounds` + signed URL, `flowers` 테이블 Realtime).
   - 없으면 로컬 모드: BroadcastChannel로 탭 간 동기화, 오디오는 data URL로 전달.
2. **`supabase/schema.sql`**: `flowers` 테이블(위 계약 필드 + room), Realtime publication, Storage 버킷. 해커톤용으로 익명 접근 RLS 단순화.
3. **`src/App.jsx`**: URL `?room=XXXXXX&me=A`로 방·사용자 구분, 녹음 버튼 → 분석 → 미리보기 카드(이름, 이유 한 줄, 분류 실패 시 카테고리 선택, 꽃말 수정) → 보내기. 우리의 꽃 판정(같은 room, 같은 sentDate, 서로 다른 sender) → `pairName()`.
4. **`src/components/Scene.jsx`**: Canvas, 그라데이션 배경, Float 섬, Sparkles(음량 반응), OrbitControls, Bloom, zone 좌표에 꽃 배치(id 시드로 지터).
5. **`src/components/Flower.jsx`**: ShapeGeometry 꽃잎(둥근/뾰족 두 형태)을 원형 복제 × layers, 겹마다 기울기 증가, 발광 중심 구, 피어나는 scale 애니메이션, 클릭 시 재생 + 이름 말풍선(drei `Html`).
6. **`src/components/Island.jsx`**: `public/models/island.glb` 있으면 `useGLTF`, 없으면 임시(실린더 원판 + 구리 테두리 + 바위 밑면 + 거울 고리 torus).
7. **`src/styles.css`**: 분홍→청록 그라데이션, 하단 녹음 버튼, 카드 UI, 모바일 우선.
8. P1: 오늘의 위로(상대 과거 소리 랜덤 재생), 소리 도감, 크리스털 성장, 나비, PositionalAudio.
9. `README.md`(실행법, 팀 역할) 작성.

## 9. 주의할 점

- YAMNet TF Hub URL이 Kaggle로 리다이렉트되며 실패할 수 있다. 실패해도 카테고리 직접 선택으로 동작해야 한다.
- iOS Safari는 webm 녹음·Web Speech 지원이 불안정하다. 시연은 안드로이드 Chrome 또는 노트북 권장.
- `THRESHOLDS`는 해커톤 초반 샘플 20개로 다시 잡는다.
- 시연 시나리오(90초): 빗소리 → 토도독꽃 / 속삭임 "오늘도 고생했어" → 소곤소곤꽃 + 꽃말 / 두 꽃이 만나 토독소곤꽃, 좌우 귀 재생 / 심사위원 참여 녹음.
