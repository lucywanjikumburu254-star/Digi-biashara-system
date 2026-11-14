"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandLogo from "@/components/brand-logo";

export default function AgentChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (password.length < 8) { setError("Choose a password with at least 8 characters."); return; }
    if (password !== confirm) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Please sign in again.");
      const { data: role, error: roleError } = await supabase.from("platform_roles")
        .select("role,status").eq("user_id", user.id).maybeSingle();
      if (roleError) throw roleError;
      if (role?.role !== "agent" || role.status !== "active") throw new Error("This page is only available to active agents.");
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;
      const { error: flagError } = await supabase.from("platform_roles")
        .update({ must_change_password: false }).eq("user_id", user.id);
      if (flagError) throw flagError;
      router.replace("/agent/dashboard"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update password."); }
    finally { setBusy(false); }
  }
  return <main><header className="top"><BrandLogo/><span className="muted">Agent account security</span></header>
    <section className="auth"><form className="authbox" onSubmit={submit}>
      <div className="eyebrow">First sign-in</div><h1>Create your private password</h1>
      <p className="muted">For your security, change the temporary phone-number password before opening your agent workspace.</p>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="field"><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></div>
      <div className="field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={e=>setConfirm(e.target.value)}/></div>
      <button className="btn" style={{width:"100%",marginTop:8}} disabled={busy}>{busy?"Updating password…":"Save password and continue"}</button>
      <p className="muted" style={{fontSize:12,marginTop:16}}>Never share your password with another person or Digi Biashara staff.</p>
    </form></section></main>;
}
