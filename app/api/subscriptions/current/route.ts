import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserEntitlements } from "@/lib/subscriptions/entitlements";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await getUserEntitlements(user.id);
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to load user entitlements:", err);
    return NextResponse.json({ error: "Failed to load entitlements" }, { status: 500 });
  }
}