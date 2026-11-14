import {createClient} from "@/lib/supabase/server";
export default async function VerifyAgentPage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;const s=await createClient();
 const {data,error}=await s.rpc("verify_agent_identity",{p_token:token});
 const agent=Array.isArray(data)?data[0]:data;
 if(error||!agent)return <main style={{maxWidth:560,margin:"60px auto",padding:24,fontFamily:"Arial,sans-serif"}}><h1>Agent verification</h1><p>This verification code is invalid or the agent record could not be found.</p><strong>Digital Kingdom Solutions · Digi Biashara</strong></main>;
 return <main style={{maxWidth:560,margin:"40px auto",padding:24,fontFamily:"Arial,sans-serif",border:"1px solid #dbe3ec",borderRadius:18}}>
  <div style={{fontWeight:800,letterSpacing:1,color:"#0f766e"}}>DIGI BIASHARA</div><p style={{color:"#64748b",marginBottom:4}}>OFFICIAL AGENT VERIFICATION</p>
  <h1 style={{marginTop:8}}>{agent.full_name}</h1><p><strong>Agent ID:</strong> {agent.agent_code}</p><p><strong>Job number:</strong> {agent.job_number}</p><p><strong>Assigned area:</strong> {agent.county}{agent.town?", "+agent.town:""}</p>
  <p><strong>Current status:</strong> <span style={{color:agent.status==="active"?"#15803d":"#b91c1c",fontWeight:700}}>{String(agent.status).toUpperCase()}</span></p>
  <hr style={{border:0,borderTop:"1px solid #e2e8f0",margin:"22px 0"}}/><p style={{fontWeight:700}}>{agent.issuer}</p><p>For verification enquiries: {agent.contact}</p>
  <small style={{color:"#64748b"}}>This page confirms the current status recorded by Digital Kingdom Solutions. It is not a government-issued identity document.</small>
 </main>;
}
