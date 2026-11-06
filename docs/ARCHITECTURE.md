# 아키텍처

`main.jsx`가 React를 마운트하고 `App.jsx`가 정원과 녹음 준비 상태를 표시합니다. 현재 데이터는 `flower.fixture.js`에서 가져옵니다. `GardenScene({ flowers, onFlowerSelect? })`는 꽃 목록을 받아 그리고, 선택 처리가 연결되면 꽃의 ID를 반환합니다. `Island`는 내장 도형을 사용합니다. 아트가 준비되면 모델 로딩을 연결하고 이 도형을 누락 및 로딩 실패 시의 대체 화면으로 사용합니다. `Flower`는 현재 `appearance.color`와 `appearance.size`를 사용합니다.

향후 데이터 흐름은 **녹음 Blob → 분석·언어 모듈 → Flower → 정원과 저장 계층**입니다. 앱이 녹음 버튼과 선택 콜백을 연결합니다. 렌더러는 꽃 데이터와 ID만 받으므로 오디오 모듈과 저장 서비스에 의존하지 않습니다. 저장 계층은 행과 `Flower`를 변환하고, 재생이 필요할 때 별도로 단기 URL을 발급합니다.

## 공유 꽃 데이터

[`src/contracts/flower.js`](../src/contracts/flower.js)에 JSDoc 타입, 허용 카테고리와 구역, 기본 외형, `isFlower(value)`가 있습니다. 모든 필드는 필수이며, 모듈 경계에서 검증합니다. [샘플 꽃](../src/contracts/flower.fixture.js)으로 데이터 구조를 확인할 수 있습니다.

| 필드 | 규칙 |
| --- | --- |
| `id`, `gardenId`, `senderId` | 각각 꽃, 정원, 인증 사용자의 UUID |
| `category` | 소문자 식별자 17개. 분류 불명 시 `other` |
| `word`, `name`, `reason` | 비어 있지 않은 문자열 |
| `transcript`, `audioPath` | 값이 없으면 `null`. `audioPath`는 비공개 버킷 안의 객체 키 |
| `features` | RMS·어택 0–1, 중심 주파수 0 Hz 이상, onset 0 이상의 정수, 길이 0초 이상 |
| `appearance` | 지정 구역과 `#RRGGBB` 색상, 꽃잎 3–8개, 겹 1–3개, 크기 0 초과 1 이하, 불리언 `pointy`, 발광 0–4 |
| `sentDate`, `createdAt` | 정원 기준 달력 날짜 `YYYY-MM-DD`, UTC ISO 8601 시각(`Z` 접미사) |

기본 외형은 `path` 구역, `#B9A4D7`, 꽃잎 5개, 2겹, 크기 0.55, 둥근 꽃잎, 발광 1입니다. 생성 모듈이 기본값을 채우고, 검증 함수는 값을 변환하지 않습니다. 정원 기준 시간대는 저장을 연결할 때 팀에서 확정합니다.

## 서비스 경계

`src/services/supabase.js`는 설정에 따라 Supabase 클라이언트 또는 `null`을 반환합니다. `supabaseStatus`는 `unconfigured`, `invalid`, `configured` 중 하나입니다. 연결 상태 및 권한은 향후 인증·저장 계층에서 확인합니다. 멤버십과 데이터 접근 계획은 [Supabase 가이드](../supabase/README.md)에 있습니다.
