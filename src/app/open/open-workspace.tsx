"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BrandLogo from "@/components/brand-logo";
import { createClient } from "@/lib/supabase/client";

type Workspace = { label: string; href: string };

export default function OpenWorkspace() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "error">("checking");

  useEffect(() => {
    let active = true;

    async function findWorkspace() {
      try {
        const supabase = createClient();
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session?.user) {
          router.replace("/login");
          return;
        }

        const userId = session.user.id;
        const { data: platformRole, error: platformRoleError } = await supabase
          .from("platform_roles")
          .select("role,must_change_password")
          .eq("user_id", userId)
          .eq("status", "active")
          .maybeSingle();
        if (platformRoleError) throw platformRoleError;

        let destination: Workspace | null = null;
        if (platformRole?.role === "super_admin") {
          destination = { label: "Open platform workspace", href: "/platform/dashboard" };
        } else if (platformRole?.role === "agent") {
          destination = {
            label: "Open agent workspace",
            href: platformRole.must_change_password ? "/agent/change-password" : "/agent/dashboard",
          };
        } else {
          const { data: membership, error: membershipError } = await supabase
            .from("business_memberships")
            .select("role")
            .eq("user_id", userId)
            .eq("status", "active")
            .in("role", ["owner", "employee"])
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (membershipError) throw membershipError;

          if (membership?.role === "owner") {
            destination = { label: "Open Digi Biashara", href: "/admin/dashboard" };
          } else if (membership?.role === "employee") {
            destination = { label: "Open Digi Biashara", href: "/employee/dashboard" };
          }
        }

        if (!active) return;
        if (!destination) {
          router.replace("/login");
          return;
        }
        setWorkspace(destination);
        setStatus("ready");
      } catch {
        if (active) setStatus("error");
      }
    }

    void findWorkspace();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main>
      <header className="top">
        <BrandLogo />
        <span className="muted">Business workspace</span>
      </header>
      <section className="auth">
        <div className="authbox">
          <div className="eyebrow">Digi Biashara</div>
          {status === "checking" && (
            <>
              <h1>Checking your workspace…</h1>
              <p className="muted">Securely checking this device.</p>
            </>
          )}
          {status === "ready" && workspace && (
            <>
              <h1>Welcome back!</h1>
              <p className="muted">Your account is ready. Open your workspace to continue.</p>
              <button className="btn" style={{ width: "100%", marginTop: 12 }} onClick={() => {
                router.replace(workspace.href);
                router.refresh();
              }}>
                {workspace.label}
              </button>
              <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
                You are signed in on this device. You do not need to enter your password again unless your session expires or you sign out.
              </p>
            </>
          )}
          {status === "error" && (
            <>
              <h1>We couldn't verify your session</h1>
              <p className="muted">Check your internet connection and try again. Your business information has not been changed.</p>
              <button className="btn" style={{ width: "100%", marginTop: 12 }} onClick={() => window.location.reload()}>
                Try again
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
