import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatApp } from "@/app/chat/chat-app";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/");

  const { data: userData } = await supabase.auth.getUser();
  const metadata = userData.user?.user_metadata ?? {};
  const name = String(metadata.full_name || metadata.name || "Google 사용자");
  const avatar = String(metadata.avatar_url || metadata.picture || "");

  return <ChatApp name={name} avatar={avatar} />;
}
