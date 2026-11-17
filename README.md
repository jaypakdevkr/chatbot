# Morrow 챗봇

KB 반려행복펫보험 약관을 찾아 답하는 RAG 챗봇입니다. Google 로그인 후 대화가 Supabase에 저장됩니다.

## 로컬 실행

```bash
npm install
cp .env.example .env
npm run dev
```

`http://localhost:3000`에서 랜딩 페이지가 열립니다.

## 처음 한 번만

1. Supabase SQL Editor에서 `supabase/migrations/20261117150000_rag_chat.sql`을 실행합니다.
2. `.env`에 `SUPABASE_SECRET_KEY`를 넣고 `npm run ingest`로 `dataset/kb.pdf`를 임베딩합니다.
3. Authentication → Providers에서 Google을 켜고, Redirect URLs에 `http://localhost:3000/auth/callback`을 추가합니다.

## 환경 변수

| 변수 | 노출 | 설명 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 서버 | 답변 생성 |
| `UPSTAGE_API_KEY` | 서버 | 문서·질문 임베딩 |
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저 | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 브라우저 | 공개 키 |
| `SUPABASE_SECRET_KEY` | 서버 | 문서 임베딩 저장용 비밀 키 |

비밀 키와 API 키는 `NEXT_PUBLIC_` 없이 두세요.

## Vercel 배포

프로젝트 **Settings → Environment Variables**에 아래 값을 넣고 배포합니다.

| 변수 | 값 |
| --- | --- |
| `OPENAI_API_KEY` | 사용 중인 OpenAI 키 |
| `UPSTAGE_API_KEY` | 사용 중인 Upstage 키 |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://uhkhmpeddzkfbceuiuhz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `SUPABASE_SECRET_KEY` | Supabase secret key (임베딩 재실행 시에만 필요) |

`OPENAI_MODEL`, `NEXT_PUBLIC_SITE_URL`은 선택입니다. 임베딩 데이터는 이미 Supabase에 있으므로 배포 후 `npm run ingest`를 다시 돌릴 필요는 없습니다.

배포 도메인이 `http://localhost:3000`과 다르면 Supabase **Authentication → URL Configuration → Redirect URLs**에 `https://<배포-도메인>/auth/callback`을 추가해야 로그인이 동작합니다.
