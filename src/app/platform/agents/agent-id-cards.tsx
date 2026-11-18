"use client";

type AgentCard = {
  id: string;
  name: string;
  code: string;
  jobNumber: string;
  territory: string;
  status: string;
  photoUrl: string;
  qrDataUrl: string;
  approvedAt: string;
};

export default function AgentIdCards({cards}:{cards:AgentCard[]}) {
  if (!cards.length) return <section className="panel"><h2>Agent identity cards</h2><p className="muted">No approved agent ID profiles are available yet.</p></section>;
  return <section className="panel agent-id-print-area">
    <style>{`
      .agent-id-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;margin-top:16px}
      .agent-id-card{width:100%;max-width:440px;aspect-ratio:1.586/1;border-radius:16px;overflow:hidden;background:#fff8f0;border:1px solid #ead7dc;box-shadow:0 8px 24px rgba(78,8,36,.12);color:#17152f;position:relative}
      .agent-id-top{height:42px;background:#4e0824;color:white;display:flex;align-items:center;justify-content:space-between;padding:0 14px;font-size:11px;letter-spacing:.08em;font-weight:800}
      .agent-id-top em{font-style:normal;color:#fff8f0;font-weight:500;letter-spacing:.02em}
      .agent-id-body{display:grid;grid-template-columns:84px 1fr 76px;gap:10px;padding:13px 12px 8px;align-items:center}
      .agent-id-photo{width:82px;height:96px;object-fit:cover;border-radius:8px;border:2px solid #870b35;background:#f2e6e9}
      .agent-id-name{font-size:15px;font-weight:800;line-height:1.15;margin-bottom:7px;overflow-wrap:anywhere}
      .agent-id-meta{font-size:10px;line-height:1.55;color:#514653}
      .agent-id-qr{width:74px;height:74px;object-fit:contain;background:white;border:4px solid white;border-radius:4px}
      .agent-id-bottom{display:flex;justify-content:space-between;align-items:center;background:#870b35;color:white;padding:7px 12px;font-size:9px;letter-spacing:.04em}
      .agent-id-status{font-weight:800;text-transform:uppercase}
      .agent-id-status.inactive{color:#ffdfb3}
      @media print{
        @page{size:A4;margin:12mm}
        body *{visibility:hidden!important}
        .agent-id-print-area,.agent-id-print-area *{visibility:visible!important}
        .agent-id-print-area{position:absolute!important;inset:0!important;width:100%!important;border:0!important;box-shadow:none!important;padding:0!important;margin:0!important}
        .agent-id-toolbar{display:none!important}
        .agent-id-grid{grid-template-columns:1fr 1fr!important;gap:10mm!important}
        .agent-id-card{width:86mm!important;height:54mm!important;max-width:none!important;break-inside:avoid;box-shadow:none!important}
      }
    `}</style>
    <div className="panelhead agent-id-toolbar"><div><h2>Agent identity cards</h2><span className="muted">{cards.length} existing ID profiles · QR verification included</span></div><button className="btn" type="button" onClick={()=>window.print()}>Print / Save all IDs as PDF</button></div>
    <div className="agent-id-grid">{cards.map(card=><article className="agent-id-card" key={card.id}>
      <div className="agent-id-top"><span>DIGI <em>BIASHARA</em></span><span>OFFICIAL SALES AGENT</span></div>
      <div className="agent-id-body">
        {card.photoUrl?<img className="agent-id-photo" src={card.photoUrl} alt="Agent portrait"/>:<div className="agent-id-photo"/>}
        <div><div className="agent-id-name">{card.name}</div><div className="agent-id-meta"><strong>AGENT ID:</strong> {card.code}<br/><strong>JOB NO:</strong> {card.jobNumber}<br/><strong>AREA:</strong> {card.territory||"Kenya"}<br/><strong>ISSUED:</strong> {new Date(card.approvedAt).toLocaleDateString("en-KE")}</div></div>
        <img className="agent-id-qr" src={card.qrDataUrl} alt="Scan to verify agent ID"/>
      </div>
      <div className="agent-id-bottom"><span>Digital Kingdom Solutions</span><span className={"agent-id-status "+(card.status==="active"?"":"inactive")}>{card.status==="active"?"ACTIVE":card.status.toUpperCase()}</span></div>
    </article>)}</div>
  </section>;
}
