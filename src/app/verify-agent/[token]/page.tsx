import {createClient} from "@/lib/supabase/server";
import BrandLogo from "@/components/brand-logo";

type VerifiedAgent = {agent_name:string;agent_code:string;job_number:string;territory:string;status:string;approved_at:string};

export default async function VerifyAgentPage({params}:{params:Promise<{token:string}>}) {
  const {token}=await params;
  const s=await createClient();
  const {data,error}=await s.rpc("verify_agent_id",{p_token:token});
  const agent=(Array.isArray(data)?data[0]:data) as VerifiedAgent|null;
  const valid=!error&&!!agent;
  const active=valid&&agent.status==="active";
  return <main className="auth-shell"><section className="auth-card" style={{maxWidth:560}}>
    <BrandLogo/>
    <div className="eyebrow">Digital Kingdom Solutions · Agent verification</div>
    {valid?<><div style={{display:"flex",alignItems:"center",gap:10,margin:"18px 0"}}><span className={"pill "+(active?"":"off")}>{active?"Verified · Active":"Not active"}</span></div>
      <h1>{agent.agent_name}</h1><p className="sub">This record confirms the identity details associated with this Digi Biashara sales agent ID.</p>
      <div className="panel"><p><strong>Agent ID:</strong> {agent.agent_code}</p><p><strong>Job number:</strong> {agent.job_number}</p><p><strong>Territory:</strong> {agent.territory||"Kenya"}</p><p><strong>Status:</strong> {agent.status.toUpperCase()}</p><p><strong>Approved:</strong> {new Date(agent.approved_at).toLocaleDateString("en-KE")}</p></div>
      <p className="muted" style={{fontSize:12}}>This verification page does not display national ID images, passport documents, personal phone numbers or private account information.</p>
    </>:<><h1>Agent ID not found</h1><p className="sub">This QR code is invalid or the agent record is no longer available. Please contact Digital Kingdom Solutions for confirmation.</p></>}
  </section></main>;
}
