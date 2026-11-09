"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
export default function Login() {
 const router = useRouter();
 const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");try{const s=createClient();const {data,error}=await s.auth.signInWithPassword({email,password});if(error)throw error;const uid=data.user.id;
 const [p,m]=await Promise.all([s.from("platform_roles").select("role").eq("user_id",uid).eq("status","active").maybeSingle(),s.from("business_memberships").select("role").eq("user_id",uid).eq("status","active").order("created_at").limit(1).maybeSingle()]);
 if(p.data?.role==="super_admin")router.push("/platform/dashboard");else if(p.data?.role==="agent")router.push("/agent/dashboard");else if(m.data?.role==="owner")router.push("/admin/dashboard");else if(m.data?.role==="employee")router.push("/employee/dashboard");else setError("Your login is active, but no business or platform role has been assigned yet. Please contact your Digi Biashara administrator or agent.");
 }catch(err){setError(err instanceof Error?err.message:"Unable to sign in.");}finally{setBusy(false);}}
 return <main><header className="top"><Link className="logo" href="/">DIGI<em>BIASHARA</em></Link><span className="muted">Secure account access</span></header><section className="auth"><form className="authbox" onSubmit={submit}><div className="eyebrow">Welcome back</div><h1>Sign in to Digi Biashara</h1><p className="muted">Use your account email and password.</p>{error&&<div className="error">{error}</div>}<div className="field"><label>Email address</label><input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></div><div className="field"><label>Password</label><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></div><button className="btn" style={{width:"100%",marginTop:8}} disabled={busy}>{busy?"Signing in…":"Sign in"}</button><p className="muted" style={{fontSize:13,marginTop:20}}>Need access? Contact your Digi Biashara administrator or authorised agent.</p></form></section></main>;
}
