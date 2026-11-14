import {createClient} from "@/lib/supabase/server";
export default async function VerifyAgentPage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;const s=await createClient();
 const {data,error}=await s.rpc("verify_agent_identity",{p_token:token});
 const agent=Array.isArray(data)?data[0]:data;
 const found=!error&&!!agent;
 const verified=found&&agent.status==="active";
 if(!found)return <main style={{maxWidth:620,margin:"48px auto",padding:28,fontFamily:"Arial,sans-serif",color:"#102a43"}}><div style={{fontWeight:900,color:"#0f766e",letterSpacing:1}}>DIGI BIASHARA</div><h1>Agent verification</h1><p>This QR code or verification link is invalid, or the agent record is unavailable.</p><strong>Digital Kingdom Solutions</strong></main>;
 return <main style={{maxWidth:620,margin:"32px auto",padding:24,fontFamily:"Arial,sans-serif",color:"#102a43"}}>
  <section style={{border:"1px solid #dbe3ec",borderRadius:20,overflow:"hidden",boxShadow:"0 12px 32px rgba(15,23,42,.08)"}}>
   <header style={{padding:"22px 24px",background:"#f0fdfa",borderBottom:"1px solid #ccfbf1"}}>
    <div style={{fontWeight:900,letterSpacing:1.2,color:"#0f766e",fontSize:22}}>DIGI BIASHARA</div>
    <div style={{fontSize:12,letterSpacing:1.5,color:"#475569",marginTop:4}}>OFFICIAL AGENT VERIFICATION</div>
   </header>
   <div style={{padding:24}}>
    <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"9px 13px",borderRadius:999,background:verified?"#dcfce7":"#fee2e2",color:verified?"#166534":"#991b1b",fontWeight:900,fontSize:13}}>
     <span aria-hidden="true">{verified?"✓":"!"}</span>{verified?"VERIFIED DIGI BIASHARA AGENT":"NOT CURRENTLY VERIFIED"}
    </div>
    <h1 style={{fontSize:28,margin:"18px 0 4px"}}>{agent.full_name}</h1>
    <p style={{margin:"0 0 20px",color:"#64748b"}}>This record is held by Digital Kingdom Solutions.</p>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
     <div style={{background:"#f8fafc",padding:14,borderRadius:12}}><small style={{color:"#64748b"}}>PERMANENT AGENT ID</small><div style={{fontWeight:800,marginTop:5}}>{agent.agent_code}</div></div>
     <div style={{background:"#f8fafc",padding:14,borderRadius:12}}><small style={{color:"#64748b"}}>JOB NUMBER</small><div style={{fontWeight:800,marginTop:5}}>{agent.job_number}</div></div>
     <div style={{background:"#f8fafc",padding:14,borderRadius:12}}><small style={{color:"#64748b"}}>COUNTY</small><div style={{fontWeight:700,marginTop:5}}>{agent.county}</div></div>
     <div style={{background:"#f8fafc",padding:14,borderRadius:12}}><small style={{color:"#64748b"}}>TOWN / AREA</small><div style={{fontWeight:700,marginTop:5}}>{agent.town||"Not specified"}</div></div>
    </div>
    <div style={{marginTop:18,padding:16,borderRadius:12,border:"1px solid "+(verified?"#86efac":"#fca5a5")}}>
     <div style={{fontSize:12,color:"#64748b",fontWeight:800}}>CURRENT COMPANY STATUS</div>
     <div style={{fontWeight:900,fontSize:18,color:verified?"#15803d":"#b91c1c",marginTop:5}}>{String(agent.status).toUpperCase()}</div>
     <p style={{fontSize:13,lineHeight:1.55,marginBottom:0}}>{verified?"The person named above is recorded as an approved and active Digi Biashara agent under Digital Kingdom Solutions.":"This person is in the company records, but their agent status is not active. Do not treat this page as confirmation that they are currently authorised to represent Digi Biashara."}</p>
    </div>
    <div style={{marginTop:20,borderTop:"1px solid #e2e8f0",paddingTop:16}}>
     <strong>Issued and verified by</strong>
     <div style={{fontSize:18,fontWeight:900,color:"#0f766e",marginTop:5}}>DIGITAL KINGDOM SOLUTIONS</div>
     <div style={{fontWeight:700}}>Digi Biashara</div>
     <p style={{fontSize:13,color:"#64748b",marginBottom:0}}>Verification enquiries: 0183873232</p>
    </div>
   </div>
  </section>
  <p style={{fontSize:11,color:"#64748b",lineHeight:1.5,marginTop:14}}>This is a company verification record, not a government-issued identity document. Always check this live page before authorising an agent to act on behalf of the company.</p>
 </main>;
}
