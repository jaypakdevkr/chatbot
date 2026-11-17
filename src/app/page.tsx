import { signInWithGoogle } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { GoogleButton } from "@/app/google-button";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/chat");

  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <main className="landing">
      <header className="landing-nav">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">m</span>
          morrow
        </span>
      </header>
      <section className="landing-hero">
        <p className="eyebrow">KB 반려행복펫보험 안내</p>
        <h1>약관을 펼치지 않아도<br /><span>궁금한 보장을 물어보세요.</span></h1>
        <p className="landing-copy">
          Morrow는 KB 반려행복펫보험 약관을 읽고, 보장 범위와 청구 절차를 쉽게 설명해 주는 AI 도우미예요.
          Google 계정으로 시작하면 대화가 채팅방마다 저장됩니다.
        </p>
        <ul className="landing-points">
          <li>약관 문서에서 관련 내용을 찾아 답해요</li>
          <li>질문과 답변, 대화 시간을 채팅방에 남겨요</li>
          <li>참고한 문서 이름을 답변 아래에 보여줘요</li>
        </ul>
        <form action={signInWithGoogle}>
          <GoogleButton />
        </form>
        {error ? <p className="landing-error" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
