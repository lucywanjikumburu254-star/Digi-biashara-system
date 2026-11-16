"use client";

import { useState } from "react";

export default function ShareAppButton({ className = "btn secondary" }: { className?: string }) {
  const [message, setMessage] = useState("");

  async function shareApp() {
    const appUrl = new URL("/install", window.location.origin).toString();
    const shareData = {
      title: "Digi Biashara",
      text: "Manage your business with Digi Biashara. Open the link to sign in or install the app.",
      url: appUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setMessage("Ready to share Digi Biashara.");
        return;
      }
      await navigator.clipboard.writeText(appUrl);
      setMessage("Digi Biashara link copied. You can now send it on WhatsApp or SMS.");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(appUrl);
        setMessage("Link copied. Send it to your customers.");
      } catch {
        setMessage(appUrl);
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
