"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Props = {
  businessId: string;
  businessName: string;
  scheduledSuspendAt: string | null;
  monthlyFee: number;
  amountDue?: number | null;
};

function reminderStage(days: number) {
  if (days <= 0 || days > 10) return null;
  if (days <= 1) return 1;
  if (days <= 3) return 3;
  if (days <= 7) return 7;
  return 10;
}

const money = (amount: number) =>
  "KSh " + Number(amount || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 });

export default function SubscriptionReminderPopup({
  businessId,
  businessName,
  scheduledSuspendAt,
  monthlyFee,
  amountDue,
}: Props) {
  const dueDate = useMemo(
    () => (scheduledSuspendAt ? new Date(scheduledSuspendAt) : null),
    [scheduledSuspendAt],
  );
  const [visible, setVisible] = useState(false);
  const [daysLeft, setDaysLeft] = useState(0);
  const [stage, setStage] = useState<number | null>(null);

  useEffect(() => {
    if (!dueDate || Number.isNaN(dueDate.getTime())) return;
    const remaining = dueDate.getTime() - Date.now();
    const days = Math.ceil(remaining / 86_400_000);
    const nextStage = reminderStage(days);
    if (!nextStage) return;

    setDaysLeft(days);
    setStage(nextStage);

    const storageKey = `db-subscription-reminder:${businessId}:${nextStage}`;
    try {
      if (window.sessionStorage.getItem(storageKey) === "shown") return;
      window.sessionStorage.setItem(storageKey, "shown");
    } catch {
      // If browser storage is unavailable, the popup still works for this visit.
    }

    setVisible(true);
    const timeout = window.setTimeout(() => setVisible(false), 20_000);
    return () => window.clearTimeout(timeout);
  }, [businessId, dueDate]);

  if (!visible || !dueDate || !stage) return null;

  const dueAmount = amountDue != null && amountDue > 0 ? amountDue : monthlyFee;
  const dueLabel = dueDate.toLocaleString("en-KE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  });

  return (
    <div className="db-subscription-overlay" role="presentation">
      <section
        className="db-subscription-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="db-subscription-title"
        aria-describedby="db-subscription-description"
      >
        <button
          type="button"
          className="db-subscription-close"
          aria-label="Close subscription reminder"
          onClick={() => setVisible(false)}
        >
          ×
        </button>
        <div className="db-subscription-kicker"><span>♧</span> SUBSCRIPTION REMINDER</div>
        <h2 id="db-subscription-title">Your subscription is approaching its due date</h2>
        <div className="db-subscription-countdown">
          <strong>{daysLeft} {daysLeft === 1 ? "DAY" : "DAYS"}</strong>
          <span>LEFT</span>
        </div>
        <p id="db-subscription-description">
          Renew <b>{businessName}</b> before the deadline to avoid automatic workspace suspension.
        </p>
        <div className="db-subscription-details">
          <div><span>Suspension date</span><b>{dueLabel} EAT</b></div>
          <div><span>Amount due</span><b>{money(dueAmount)}</b></div>
          <div><span>Reminder stage</span><b>{stage} days before suspension</b></div>
        </div>
        <div className="db-subscription-safe">✓ Your business data remains safe. Payment restores access once confirmed.</div>
        <div className="db-subscription-actions">
          <Link className="db-subscription-primary" href="/admin/billing" onClick={() => setVisible(false)}>
            View payment details
          </Link>
          <button type="button" className="db-subscription-later" onClick={() => setVisible(false)}>
            Remind me later
          </button>
        </div>
        <div className="db-subscription-timer" aria-label="This reminder closes automatically after 20 seconds">
          <span />
        </div>
      </section>
    </div>
  );
}
