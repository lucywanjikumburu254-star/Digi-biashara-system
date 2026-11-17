"use client";
export default function PrintIdButton(){return <button type="button" onClick={()=>window.print()} style={{padding:"10px 16px",border:0,borderRadius:8,background:"#0f766e",color:"#fff",fontWeight:700,cursor:"pointer"}}>Print / Save as PDF</button>;}
