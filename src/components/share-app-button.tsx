"use client";

import { useState } from "react";

const APP_URL = "https://digi-biashara-fresh.vercel.app/install";

export default function ShareAppButton({ className = "btn secondary" }: { className?: string }) {
  const [message, setMessage] = useState("");

  async function shareApp() {
    const shareData = {
      title: "Digi Biashara",
      text: "Manage your business with Digi Biashara. Open the link to sign in or install the app.",
      url: APP_URL,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setMessage("Ready to share Digi Biashara.");
        return;
      }
      await navigator.clipboard.writeText(APP_URL);
      setMessage("Digi Biashara link copied. You can now send it on WhatsApp or SMS.");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(APP_URL);
        setMessage("Link copied. Send it to your customers.");
      } catch {
        setMessage(APP_URL);
      }
    }
  }

  return (
    <span className="share-app-control">
      <button type="button" className={className} onClick={() => void shareApp()}>
        <span aria-hidden="true">↗</span> Share Digi Biashara
      </button>
      {message && <small className="share-app-feedback" role="status">{message}</small>}
    </span>
  );
}
