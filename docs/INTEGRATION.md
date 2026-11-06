# 팀 통합 가이드

## 기존 브랜치

| 브랜치 | 가져올 작업 |
| --- | --- |
| `feat/3d` | `main`의 시작점. 기존 `src/lib`에 녹음, 분석, YAMNet 분류, 의성어 생성, 재생 코드가 있습니다. |
| `feat/stt-flowerword` | 음성 여부 선택, 녹음 중 파형, Web Speech 인식, 별도 꽃 생성기와 감정 API 호출 예제 |
| `feat/emotion-server` | 선택 기능인 FastAPI/HuBERT 기반 한국어 음성 감정 분석 서버 |

세 기능 브랜치의 Git 이력은 독립적입니다. 통합 작업은 `main`에서 분기하고, 필요한 모듈과 변경을 골라 적용합니다. 기존 브랜치의 `App.jsx`, 패키지 설정, 진입점은 파일 단위로 덮어쓰기 전에 현재 앱과 비교합니다.

## 통합 순서

1. **아트와 렌더링** · A는 `public/models/island.glb`를 제공하고 B와 크기, 원점, `zone_water` 같은 구역 마커를 맞춥니다. B는 샘플 `Flower`로 렌더링과 선택을 먼저 확인한 뒤 GLB를 연결합니다. 작은 화면과 모델 누락 상태도 확인합니다.
2. **오디오와 언어** · C는 `src/lib/recorder.js`의 10초 녹음, `analyze.js`의 디코딩·특징 추출, `classify.js`의 분류, `onomatopoeia.js`의 작명부터 재사용합니다. 파형과 인식은 필요한 동작만 비교해 통합합니다. 결과를 어댑터에서 공용 타입으로 정리하고 `isFlower`로 검증합니다.
3. **저장과 배포** · D는 정원 멤버십과 RLS를 먼저 검증하고 업로드, 조회, 선택 재생, Realtime 순서로 연결합니다. Vercel에서 `npm run build`와 `dist/`를 사용합니다. 녹음 기능이 연결되면 HTTPS에서 권한과 모바일 동작을 확인합니다.
4. **감정 분석** · 필요할 때 선택 기능으로 연결합니다. 설정 여부와 API 실패가 꽃 생성 및 앱 시작에 영향을 주지 않도록 오디오 모듈 경계에서 처리합니다.

## 이름과 데이터 변환

- `src/lib/analyze.js`의 기존 `buildFlower`는 `sender`, 평평한 외형 필드, `audioUrl`, 숫자 타임스탬프를 반환합니다. 어댑터가 정원·사용자 UUID를 넣고 외형을 `appearance`에 모읍니다. 생성 시각은 UTC ISO 문자열로 변환하고 `sentDate`는 정원 시간대를 사용해 계산합니다.
- `feat/stt-flowerword`의 `walk`, `laugh`, `sing`은 각각 `footsteps`, `laughter`, `singing`으로 매핑합니다. `pointed`는 `pointy`로 옮기고 HSL 색상을 6자리 HEX로 정규화합니다.
- `src/scene/Flower.jsx`는 렌더러, `src/contracts/flower.js`는 데이터 계약입니다. STT 브랜치의 `src/Flower.jsx` 및 `src/flower.js`는 이 역할을 기준으로 비교합니다.
- 재생 URL은 저장 객체와 분리합니다. `src/lib/player.js`의 `playFlower`와 `playPair`에는 앱 또는 저장 계층에서 발급한 URL을 전달합니다.
