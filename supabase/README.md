# Supabase 통합 계획

프런트엔드 초기화는 `src/services/supabase.js`에 있습니다. 프로젝트 URL과 공개용 키를 `.env.local`에 설정할 수 있습니다. 이 단계의 초기화는 DB 및 스토리지 리소스를 생성하지 않습니다.

1. 사용자별로 Supabase 익명 세션을 생성하고 세션의 사용자 UUID를 `senderId`로 사용합니다. 익명으로 로그인한 사용자도 `authenticated` 역할을 사용합니다. [Supabase 익명 로그인 문서](https://supabase.com/docs/guides/auth/auth-anonymous)
2. 정원 UUID와 사용자 UUID를 멤버십으로 연결합니다. 초대 코드는 검증된 가입 흐름에 사용하고, 꽃 및 오디오 접근 권한은 RLS에서 `auth.uid()`의 정원 멤버십으로 검증합니다. 쓰기는 사용자 본인의 `senderId`로 제한합니다.
3. 오디오는 비공개 버킷에 두고 꽃 데이터에는 객체 키만 저장합니다. 멤버에게만 만료되는 재생 URL을 발급합니다.
4. 멤버와 비멤버 세션으로 읽기, 쓰기, 다운로드 범위를 검증한 뒤 Realtime을 연결합니다.
