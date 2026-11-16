"use client";

import { useState } from "react";

const suggestions = [
  "How much have I sold today?",
  "Which products need restocking?",
  "Show my best-selling products",
  "How are my branches performing?",
];

export default function DigiAiFloating() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string[]>([]);

  function submit(value = question) {
    const clean = value.trim();
    if (!clean) return;
    setAsked((current) => [...current, clean]);
    setQuestion("");
  }

  return (
    <div className="digi-ai-root">
      {open && (
        <section className="digi-ai-panel" role="dialog" aria-label="Digi AI assistant" aria-modal="false">
          <header className="digi-ai-header">
            <span className="digi-ai-mark" aria-hidden="true">✦</span>
            <div className="digi-ai-heading"><strong>Digi AI</strong><small>Your Business Assistant</small></div>
            <span className="digi-ai-ready">READY</span>
            <button type="button" className="digi-ai-close" onClick={() => setOpen(false)} aria-label="Minimise Digi AI">−</button>
          </header>
          <div className="digi-ai-body">
            <div className="digi-ai-intro"><strong>Hello! How can I help you today?</strong><p>I’m here to help you understand your business and make better decisions.</p></div>
            {asked.length > 0 && <div className="digi-ai-thread" aria-live="polite">{asked.map((item, index) => <div className="digi-ai-exchange" key={index}><div className="digi-ai-user-message">{item}</div><div className="digi-ai-notice">Business data analysis is being connected. I won’t guess figures or show results until the secure, permission-aware insights engine is enabled.</div></div>)}</div>}
            <div className="digi-ai-suggestions"><strong>QUICK QUESTIONS</strong>{suggestions.map((item) => <button type="button" key={item} onClick={() => submit(item)}>{item}<span>›</span></button>)}</div>
          </div>
          <form className="digi-ai-compose" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about your business..." aria-label="Ask Digi AI about your business" />
            <button type="submit" disabled={!question.trim()} aria-label="Send question">➤</button>
          </form>
          <p className="digi-ai-footnote">Secure business insights · No external AI API</p>
        </section>
      )}
      <button type="button" className="digi-ai-launcher" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? "Close Digi AI" : "Open Digi AI"}>
        <span className="digi-ai-launcher-icon">✦</span><span>Digi AI</span>
      </button>
    </div>
  );
}
