"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Props = { businessId: string; businessName: string; audience: "owner" | "staff"; children: ReactNode };

export default function BusinessSuspensionGuard({ businessId, businessName, audience, children }: Props) {
  const db = useMemo(() => createClient(), []);
  const [suspended, setSuspended] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const [businessResult, subscriptionResult] = await Promise.all([
        db.from("businesses").select("status").eq("id", businessId).maybeSingle(),
        db.from("business_subscriptions").select("status").eq("business_id", businessId).maybeSingle(),
      ]);
      if (!active) return;
      if (!businessResult.error && !subscriptionResult.error) {
        const businessBlocked = !!businessResult.data && businessResult.data.status !== "active";
        const subscriptionBlocked = !!subscriptionResult.data &&
          ["suspended", "cancelled"].includes(subscriptionResult.data.status);
        setSuspended(businessBlocked || subscriptionBlocked);
      }
      setChecking(false);
    };

    void check();
    const interval = window.setInterval(() => void check(), 5_000);
    const channel = db.channel(`business-access-${businessId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "businesses", filter: `id=eq.${businessId}` }, payload => {
        void check();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "business_subscriptions", filter: `business_id=eq.${businessId}` }, payload => {
        void check();
      })
      .subscribe();

    return () => {
      active = false;
      window.clearInterval(interval);
      void db.removeChannel(channel);
    };
  }, [businessId, db]);

  if (suspended) {
    return (
      <main className="db-suspension-screen">
        <section className="db-suspension-card">
          <div className="db-suspension-lock">⌑</div>
          <div className="eyebrow">SUBSCRIPTION ACCESS</div>
          <h1>Business access temporarily suspended</h1>
          <p><b>{businessName}</b> has been suspended because its subscription requires attention.</p>
          <div className="db-suspension-safe">✓ Your business data remains safe and has not been deleted.</div>
          {audience === "owner" ? (
            <Link className="db-subscription-primary" href="/admin/billing">View billing & payment details</Link>
          ) : (
            <p className="db-suspension-help">Please contact your business owner to arrange payment and restore access.</p>
          )}
          <form action="/logout" method="post"><button type="submit" className="db-suspension-signout">Sign out</button></form>
        </section>
      </main>
    );
  }

  if (checking) return <>{children}</>;
  return <>{children}</>;
}
