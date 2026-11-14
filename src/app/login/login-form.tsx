"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandLogo from "@/components/brand-logo";

type LoginPortal = "business" | "platform";

export function LoginForm({ portal }: { portal: LoginPortal }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isPlatformPortal = portal === "platform";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const supabase = createClient();

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;

      const userId = data.user.id;
      const { data: platformRole, error: platformRoleError } = await supabase
        .from("platform_roles")
        .select("role,must_change_password")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

      if (platformRoleError) throw platformRoleError;

      if (isPlatformPortal) {
        if (platformRole?.role === "super_admin") {
          router.replace("/platform/dashboard");
          router.refresh();
          return;
        }
        if (platformRole?.role === "agent") {
          router.replace("/agent/dashboard");
          router.refresh();
          return;
        }

        await supabase.auth.signOut();
        setError("This account has no active platform role. Ask the platform administrator to grant super-admin or agent access.");
        return;
      }

      if (platformRole?.role === "super_admin" || platformRole?.role === "agent") {
        await supabase.auth.signOut();
        setError("This is a platform team account. Use the Platform team sign-in page instead.");
        return;
      }

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
        router.replace("/admin/dashboard");
        router.refresh();
        return;
      }
      if (membership?.role === "employee") {
        router.replace("/employee/dashboard");
        router.refresh();
        return;
      }

      await supabase.auth.signOut();
      setError("This account has no active business membership. Business access is created by an authorised Digi Biashara administrator or agent.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="top">
        <BrandLogo />
        <span className="muted">{isPlatformPortal ? "Platform team access" : "Business account access"}</span>
      </header>
      <section className="auth">
        <form className="authbox" onSubmit={submit}>
          <div className="eyebrow">{isPlatformPortal ? "Authorised platform staff" : "Business workspace"}</div>
          <h1>{isPlatformPortal ? "Platform team sign in" : "Business sign in"}</h1>
          <p className="muted">
            {isPlatformPortal
              ? "For Digi Biashara super administrators and authorised agents."
              : "For registered business owners and team members."}
          </p>
          {error && <div className="error" role="alert">{error}</div>}
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="muted" style={{ fontSize: 13, marginTop: 20 }}>
            {isPlatformPortal ? (
              <>Business owners should use <Link href="/login">Business sign in</Link>.</>
            ) : (
              <>Platform administrators and agents should use <Link href="/platform/login">Platform team sign in</Link>.</>
            )}
          </p>
        </form>
      </section>
    </main>
  );
}
