"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Props = { businessId: string; businessName: string };

function reminderStage(days: number) {
  if (days <= 0 || days > 10) return null;
  if (days <= 1) return 1;
  if (days <= 3) return 3;
  if (days <= 7) return 7;
  return 10;
}
const money = (amount: number) =>
  "KSh " + Number(amount || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 });

export default function SubscriptionReminderPopup({ businessId, businessName }: Props) {
  const db = useMemo(() => createClient(), []);
  const [visible, setVisible] = useState(false);
  const [daysLeft, setDaysLeft] = useState(0);
  const [stage, setStage] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [amountDue, setAmountDue] = useState(0);

  useEffect(() => {
    let active = true;
    let timeout: number | undefined;
    let interval: number | undefined;
    let shownThisMount = false;

    const checkSubscription = async () => {
      const { data, error } = await db
        .from("business_subscriptions")
        .select("scheduled_suspend_at,monthly_fee")
        .eq("business_id", businessId)
        .maybeSingle();
      if (!active || error || !data?.scheduled_suspend_at) return;

      const due = new Date(data.scheduled_suspend_at);
      if (Number.isNaN(due.getTime())) return;
      const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
      const nextStage = reminderStage(days);
      if (!nextStage) return;

      const { data: { user } } = await db.auth.getUser();
      if (!active || !user) return;
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
      const storageKey = `db-subscription-reminder:${businessId}:${user.id}:${today}`;
      try {
        if (window.localStorage.getItem(storageKey) === "shown") {
          if (interval) window.clearInterval(interval);
          return;
        }
        window.localStorage.setItem(storageKey, "shown");
      } catch {
        // Fall back to one display per mounted workspace visit if browser storage is unavailable.
      }

      if (!active || shownThisMount) return;
      shownThisMount = true;
      setDueDate(due);
      setDaysLeft(days);
      setStage(nextStage);
      setAmountDue(Number(data.monthly_fee ?? 0));
      setVisible(true);
      if (interval) window.clearInterval(interval);
      timeout = window.setTimeout(() => setVisible(false), 10_000);
    };

    interval = window.setInterval(() => void checkSubscription(), 60_000);
    void checkSubscription();

    return () => {
      active = false;
      if (interval) window.clearInterval(interval);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [businessId, db]);

  if (!visible || !dueDate || !stage) return null;
  const dueLabel = dueDate.toLocaleString("en-KE", {
    dateStyle: "long", timeStyle: "short", timeZone: "Africa/Nairobi",
  });

  return (
    <div className="db-subscription-overlay" role="presentation">
      <section className="db-subscription-popup" role="dialog" aria-modal="true"
        aria-labelledby="db-subscription-title" aria-describedby="db-subscription-description">
        <button type="button" className="db-subscription-close" aria-label="Close subscription reminder"
          onClick={() => setVisible(false)}>×</button>
        <div className="db-subscription-kicker"><span>♧</span> SUBSCRIPTION REMINDER</div>
        <h2 id="db-subscription-title">Your subscription is approaching its due date</h2>
        <div className="db-subscription-countdown"><strong>{daysLeft} {daysLeft === 1 ? "DAY" : "DAYS"}</strong><span>LEFT</span></div>
        <p id="db-subscription-description">Renew <b>{businessName}</b> before the deadline to avoid automatic workspace suspension.</p>
        <div className="db-subscription-details">
          <div><span>Suspension date</span><b>{dueLabel} EAT</b></div>
          <div><span>Amount due</span><b>{money(amountDue)}</b></div>
          <div><span>Reminder stage</span><b>{stage} days before suspension</b></div>
        </div>
        <div className="db-subscription-safe">✓ Your business data remains safe. Access is restored once payment is confirmed.</div>
        <div className="db-subscription-actions">
          <Link className="db-subscription-primary" href="/admin/billing" onClick={() => setVisible(false)}>View payment details</Link>
          <button type="button" className="db-subscription-later" onClick={() => setVisible(false)}>Remind me later</button>
        </div>
        <div className="db-subscription-timer" aria-label="This reminder closes automatically after 10 seconds"><span /></div>
      </section>
    </div>
  );
}
