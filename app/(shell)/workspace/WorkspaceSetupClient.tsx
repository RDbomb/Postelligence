"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Plus, Bell } from "lucide-react";

export default function WorkspaceSetupClient() {
  const router = useRouter();
  const [name, setName]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create workspace");
      setSuccess(`Workspace "${data.workspace.name}" created!`);
      setTimeout(() => {
        router.push("/team");
        router.refresh();
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-black flex items-center justify-center">
            <Users className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Team Workspace</h1>
            <p className="text-sm text-gray-500">Collaborate with your team on Postelligence</p>
          </div>
        </div>

        {/* Create */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Workspace Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Marketing Team"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-black text-white text-sm font-medium rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {loading ? "Creating..." : "Create Workspace"}
          </button>
        </div>

        {/* Been invited? — invites are notification-driven, no token to paste. */}
        <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-gray-50 px-4 py-3">
          <Bell className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" />
          <p className="text-xs leading-5 text-gray-500">
            Been invited to a workspace? You don&apos;t need a code — you&apos;ll get a
            notification here once someone adds you. Open the bell icon and accept it to join.
          </p>
        </div>

        {/* Feedback */}
        {error && (
          <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-600 font-medium">
            ✓ {success}
          </div>
        )}
      </div>
    </div>
  );
}