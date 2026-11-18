/* eslint-disable @typescript-eslint/no-explicit-any */
import {redirect,notFound} from "next/navigation";
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import AgentProfileEditor from "./profile-editor";
export default async function AgentProfilePage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const s=await createClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/platform/login");
 const {data:role}=await s.from("platform_roles").select("role").eq("user_id",user.id).eq("status","active").maybeSingle();if(role?.role!=="super_admin")redirect("/platform/login");
 const {data:profile}=await s.from("platform_agent_profiles").select("id,linked_user_id,full_name,email,phone,county,town,agent_code,job_number,passport_photo_path,national_id_image_path,status").eq("id",id).maybeSingle();
 if(!profile)notFound();
 const {data:passport}=profile.passport_photo_path?await s.storage.from("agent-application-documents").createSignedUrl(profile.passport_photo_path,1800):{data:null};
 const {data:national}=profile.national_id_image_path?await s.storage.from("agent-application-documents").createSignedUrl(profile.national_id_image_path,1800):{data:null};
 return <div className="layout"><main className="main"><header className="dashhead"><strong>Agent profile management</strong><Link className="btn secondary small" href="/platform/agents">Back to agents</Link></header><section className="dashcontent"><div className="eyebrow">Digital Kingdom Solutions · Admin</div><h1>Agent profile</h1><p className="sub">Review documents, correct profile information and keep the official identity card accurate.</p><AgentProfileEditor profile={profile} passportUrl={passport?.signedUrl??""} nationalIdUrl={national?.signedUrl??""}/></section></main></div>;
}
