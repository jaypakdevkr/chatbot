# Morrow 챗봇

Next.js App Router와 OpenAI API를 사용하는 한국어 스트리밍 챗봇입니다. Vercel에 바로 배포할 수 있습니다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local
```

`.env.local`에 OpenAI API 키를 입력한 다음 실행합니다.

```bash
npm run dev
```

`http://localhost:3000`에서 확인할 수 있습니다.

## 환경 변수

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 예 | OpenAI API 키. 브라우저에 노출되지 않습니다. |
| `OPENAI_MODEL` | 아니요 | 사용할 모델. 기본값은 `gpt-4o-mini`입니다. |

## Vercel 배포

1. 이 저장소를 Vercel에 연결합니다.
2. 프로젝트 **Settings → Environment Variables**에 `OPENAI_API_KEY`를 추가합니다. 필요하면 `OPENAI_MODEL`도 설정합니다.
3. 배포합니다. 별도의 빌드 설정은 필요하지 않습니다.

API 키는 `NEXT_PUBLIC_` 접두사 없이 설정해 주세요. 이 앱은 OpenAI API를 통해 답변을 생성하므로 OpenAI 사용량에 따라 비용이 발생할 수 있습니다.

## 확인

```bash
npm run lint
npm run typecheck
npm run build
```
