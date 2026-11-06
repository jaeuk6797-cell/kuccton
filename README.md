# SUP · 소리숲

SUP는 두 사람이 짧은 소리를 주고받아 함께 가꾸는 3D 공중 정원입니다. 현재 개발용 앱은 임시 섬과 샘플 꽃 한 송이를 보여줍니다. 녹음 버튼은 준비 상태를 표시합니다.

## 시작하기

Node.js 22 이상과 npm이 필요합니다. 팀 공용 기준 브랜치는 `main`입니다.

```sh
npm install
npm run dev
```

터미널에 표시된 주소를 WebGL을 지원하는 브라우저에서 엽니다. `npm run build`로 `dist/`를 빌드하고 `npm run preview`로 빌드 결과를 확인합니다. CI에서는 잠금 파일을 사용하는 `npm ci`를 실행합니다.

## 환경 설정

앱은 환경 설정 없이 시작합니다. Supabase를 연결할 때만 `.env.example`을 `.env.local`로 복사하고 값을 설정합니다.

| 변수 | 값 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | 브라우저용 publishable 키 또는 기존 anon 키 |
| `VITE_EMOTION_API_URL` | 향후 음성 감정 분석 서버 주소 |

`VITE_` 값은 브라우저에 공개됩니다. 비밀 키와 service-role 키는 서버에만 보관합니다. 개발 화면의 Supabase 상태는 클라이언트 초기화 여부를 표시합니다.

## 구조

```text
src/
  main.jsx, App.jsx, styles.css   앱 진입점과 화면
  scene/                         R3F 정원, 섬, 꽃
  contracts/                     공용 꽃 타입, 검증, 샘플
  services/                      Supabase 초기화
  lib/                           기존 녹음·분석·분류·재생 유틸리티
docs/                            아키텍처와 통합 순서
supabase/                        인증 및 접근 제어 계획
```

기반 스택은 React 18, JavaScript/JSX, Vite 5, Three.js, R3F 8, Drei 9, React Three Postprocessing 2입니다. 아트는 Blender에서 GLB로 내보냅니다. 오디오 작업은 MediaRecorder, Web Audio, Web Speech와 기존 TensorFlow.js/YAMNet 유틸리티를 이어서 사용합니다. Supabase와 Vercel은 백엔드와 프런트엔드 배포 대상입니다. FastAPI/HuBERT 감정 분석은 선택 통합입니다.

## 팀 작업

| 담당 | 다음 작업 |
| --- | --- |
| A · 3D 아트 | `public/models/island.glb`를 추가하고 섬 원점, 스케일, 구역 마커를 B와 합의합니다. |
| B · 3D 프런트엔드 | `GardenScene`, `Island`, `Flower`를 확장하고 샘플 꽃으로 모바일 렌더링을 확인합니다. |
| C · 오디오와 언어 | 기존 오디오 유틸리티를 사용해 공유 `Flower`를 반환하는 어댑터를 만듭니다. |
| D · 백엔드와 통합 | 익명 세션과 정원 멤버십을 설계하고 접근 제어, 저장, 배포를 검증합니다. |

각 작업은 `main`에서 새 브랜치를 만들어 시작합니다. [아키텍처](docs/ARCHITECTURE.md)와 [통합 가이드](docs/INTEGRATION.md)에 공유 인터페이스와 기존 브랜치의 차이가 정리되어 있습니다.
