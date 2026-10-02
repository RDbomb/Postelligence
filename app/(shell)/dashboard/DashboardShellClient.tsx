"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import Sidebar from "@/components/shell/Sidebar";
import Topbar from "@/components/shell/Topbar";
import type { SocialAccount } from "@/lib/integrations/social-accounts";
import { SubscriptionProvider, type SubscriptionContextValue } from "@/components/billing/SubscriptionContext";

interface User {
  email?: string | null;
  user_metadata?: { full_name?: string; avatar_url?: string; name?: string };
}

export default function DashboardShellClient({
  user,
  socialAccounts: _socialAccounts,
  workspaceName,
  subscription,
  children,
}: {
  user: User;
  socialAccounts: SocialAccount[];
  workspaceName?: string | null;
  subscription?: Partial<SubscriptionContextValue> | null;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <SubscriptionProvider value={subscription}>
      <div className="dashboard-light relative min-h-screen overflow-hidden bg-[#f6f7f1] text-[#1f2528]">
        {/* Background */}
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(43,114,100,0.08),transparent_34%),linear-gradient(315deg,rgba(208,89,69,0.07),transparent_30%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(31,37,40,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(31,37,40,0.045)_1px,transparent_1px)] bg-[size:72px_72px] opacity-50" />
        </div>

        <div className="relative flex min-h-screen p-4 lg:p-6">
          {/* Sidebar */}
          <Sidebar
            user={user}
            workspaceName={workspaceName}
            open={sidebarOpen}
            onToggle={() => setSidebarOpen(o => !o)}
          />

          {/* Main */}
          <main
            className={cn(
              "min-w-0 flex-1 transition-all",
              sidebarOpen
                ? "lg:ml-[260px] duration-[240ms] ease-out"
                : "lg:ml-[100px] duration-[110ms] ease-in"
            )}
          >
            {/* Topbar */}
            <Topbar user={user} onMobileMenuToggle={() => setSidebarOpen(o => !o)} />

            {/* Page content */}
            <div className="pb-24">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SubscriptionProvider>
  );
}