"use client";

import {useState} from "react";
type AgentCard={id:string;name:string;code:string;jobNumber:string;territory:string;status:string;photoUrl:string;qrDataUrl:string;approvedAt:string};
export default function AgentIdCards({cards}:{cards:AgentCard[]}){
 const [printing,setPrinting]=useState<string|null>(null);
 if(!cards.length)return <section className="panel"><h2>Agent identity cards</h2><p className="muted">No approved agent ID profiles are available yet.</p></section>;
 function printOne(id:string){setPrinting(id);window.setTimeout(()=>{window.print();setPrinting(null)},80)}
 return <section className="panel agent-id-print-area">
 <style>{`
 .agent-id-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:22px;margin-top:18px}
 .agent-id-card{width:100%;max-width:470px;aspect-ratio:1.586/1;border-radius:18px;overflow:hidden;background:#fff;color:#10204b;position:relative;border:1px solid #d8e5fb;box-shadow:0 12px 30px #082d731c;isolation:isolate}
 .agent-id-card:before{content:"";position:absolute;inset:0 0 auto;height:7px;background:linear-gradient(90deg,#082d73,#0876f9,#f5b51b)}
 .agent-id-top{height:55px;background:linear-gradient(110deg,#082d73,#0755d8);color:white;display:flex;align-items:center;justify-content:space-between;padding:0 17px;font-size:12px;letter-spacing:.08em;font-weight:900}
 .agent-id-top em{font-style:normal;color:#bcd7ff}.agent-id-top small{font-size:8px;letter-spacing:.13em;color:#dce9ff}
 .agent-id-body{display:grid;grid-template-columns:88px minmax(0,1fr) 74px;gap:12px;padding:17px 15px 13px;align-items:center}
 .agent-id-photo{width:86px;height:105px;object-fit:cover;object-position:center;border-radius:10px;border:2px solid #dce9ff;background:#f2f6ff}
 .agent-id-name{font-size:16px;font-weight:900;line-height:1.15;margin-bottom:9px;overflow-wrap:anywhere;color:#082d73}
 .agent-id-meta{font-size:9px;line-height:1.75;color:#526586}.agent-id-meta b{color:#173b7b;letter-spacing:.04em}
 .agent-id-qr{width:72px;height:72px;object-fit:contain;background:white;border:5px solid #f0f5ff;border-radius:8px}
 .agent-id-scan{font-size:7px;text-align:center;color:#64799c;margin-top:4px;font-weight:800;letter-spacing:.06em}
 .agent-id-bottom{height:30px;display:flex;justify-content:space-between;align-items:center;background:#f0f5ff;border-top:1px solid #dce8fb;padding:0 15px;font-size:8px;letter-spacing:.05em;color:#34517f;font-weight:800}
 .agent-id-status{font-weight:900;text-transform:uppercase;color:#07804b}.agent-id-status.inactive{color:#b45309}
 .agent-id-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.agent-id-actions a{font-size:12px;color:#0755d8;font-weight:800;text-decoration:underline;text-underline-offset:3px}
 @media print{
 @page{size:A4;margin:12mm}body *{visibility:hidden!important}
 .agent-id-card,.agent-id-card *{visibility:visible!important}
 .agent-id-card{display:none!important}
 .agent-id-card.printing{display:block!important;position:absolute!important;left:0!important;top:0!important;width:86mm!important;height:54mm!important;max-width:none!important;box-shadow:none!important;break-inside:avoid}
 .agent-id-print-area:has(.agent-id-card.printing) .agent-id-card.printing{display:block!important}
 .agent-id-toolbar,.agent-id-actions{display:none!important}
 .agent-id-print-area:has(.agent-id-card.printing){position:absolute!important;inset:0!important;border:0!important;box-shadow:none!important;padding:0!important;margin:0!important}
 .agent-id-print-area:has(.agent-id-card.printing) .agent-id-grid{display:block!important}
 }
 `}</style>
 <div className="panelhead agent-id-toolbar"><div><h2>Official agent identity cards</h2><span className="muted">{cards.length} profiles · Secure QR verification</span></div><button className="btn" type="button" onClick={()=>window.print()}>Print / Save all IDs as PDF</button></div>
 <div className="agent-id-grid">{cards.map(card=><div key={card.id}>
 <article className={"agent-id-card"+(printing===card.id?" printing":"")}>
 <div className="agent-id-top"><span>DIGI <em>BIASHARA</em></span><small>OFFICIAL SALES AGENT</small></div>
 <div className="agent-id-body">{card.photoUrl?<img className="agent-id-photo" src={card.photoUrl} alt="Agent portrait"/>:<div className="agent-id-photo"/>}
 <div><div className="agent-id-name">{card.name}</div><div className="agent-id-meta"><b>AGENT ID</b> · {card.code}<br/><b>JOB NUMBER</b> · {card.jobNumber}<br/><b>TERRITORY</b> · {card.territory||"Kenya"}<br/><b>ISSUED</b> · {card.approvedAt?new Date(card.approvedAt).toLocaleDateString("en-KE"):"—"}</div></div>
 <div><img className="agent-id-qr" src={card.qrDataUrl} alt="Scan to verify agent ID"/><div className="agent-id-scan">SCAN TO VERIFY</div></div></div>
 <div className="agent-id-bottom"><span>DIGITAL KINGDOM SOLUTIONS</span><span className={"agent-id-status "+(card.status==="active"?"":"inactive")}>{card.status==="active"?"ACTIVE":card.status.toUpperCase()}</span></div>
 </article>
 <div className="agent-id-actions"><a href={"/platform/agents/"+card.id}>Open agent profile</a><a href="#" onClick={e=>{e.preventDefault();printOne(card.id)}}>Print / save this ID</a></div>
 </div>)}</div></section>;
}
