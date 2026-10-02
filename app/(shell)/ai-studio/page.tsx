import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/require-user";
import AIStudioClient from "./AIStudioClient";
import { getUserEntitlements } from "@/lib/subscriptions/entitlements";

export const metadata: Metadata = {
  title: "AI Studio",
  description: "Generate captions, hashtags and images for your posts."
};

export const dynamic = "force-dynamic";

export default async function AIStudioPage() {
  const { user } = await requireUser();
  const { entitlements } = await getUserEntitlements(user.id);

  return (
    <AIStudioClient
      user={{
        email: user.email,
        user_metadata: user.user_metadata as Record<string, string>,
      }}
      initialAllowed={entitlements.canAccessAiStudio}
    />
  );
}