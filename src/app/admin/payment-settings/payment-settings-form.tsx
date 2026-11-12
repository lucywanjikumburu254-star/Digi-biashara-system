"use client";

import { useEffect, useState, type FormEvent } from "react";
import BusinessNav from "@/components/business-nav";

type AccountType = "paybill" | "till" | "pochi";
type Account = {
  account_type: AccountType;
  account_number: string;
  shortcode: string;
  environment: "sandbox" | "production";
  enabled: boolean;
  connection_status?: string;
  credentials_configured?: boolean;
  consumer_key: string;
  consumer_secret: string;
  passkey: string;
};

const blank = (account_type: AccountType): Account => ({
  account_type, account_number: "", shortcode: "", environment: "sandbox",
  enabled: false, consumer_key: "", consumer_secret: "", passkey: "",
});

export default function PaymentSettingsForm({ businessId, businessName }: { businessId: string; businessName: string }) {
  const [contactPhone, setContactPhone] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([blank("paybill"), blank("till"), blank("pochi")]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/business/payment-settings?business_id=" + encodeURIComponent(businessId), { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load payment settings.");
        if (!active) return;
        setContactPhone(data.contact_phone ?? "");
        setAccounts((current) => current.map((item) => {
          const saved = (data.accounts ?? []).find((x: any) => x.account_type === item.account_type);
          return saved ? { ...item, ...saved, consumer_key: "", consumer_secret: "", passkey: "" } : item;
        }));
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Unable to load payment settings.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [businessId]);

  const update = (type: AccountType, key: keyof Account, value: string | boolean) => {
    setAccounts((current) => current.map((item) => item.account_type === type ? { ...item, [key]: value } : item));
  };

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/business/payment-settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: businessId, contact_phone: contactPhone, accounts }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save payment settings.");
      setMessage(data.message || "Payment settings saved.");
      setAccounts((current) => current.map((item) => ({ ...item, consumer_key: "", consumer_secret: "", passkey: "" })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save payment settings.");
    } finally {
      setSaving(false);
    }
  }

  const field = (label: string, value: string, onChange: (v: string) => void, type = "text", placeholder = "") => (
    <label className="field"><span>{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>
  );

  const paybill = accounts.find((x) => x.account_type === "paybill")!;
  const till = accounts.find((x) => x.account_type === "till")!;
  const pochi = accounts.find((x) => x.account_type === "pochi")!;

  return <div className="layout"><BusinessNav active="payment-settings" /><main className="main">
    <header className="dashhead"><strong>{businessName}</strong><span className="muted">Payment configuration</span></header>
    <section className="dashcontent">
      <div className="eyebrow">Business settings</div><h1>Payment methods</h1>
      <p className="sub">Add the M-Pesa accounts your customers can use. Only the business owner can manage these settings. Cashiers cannot see Daraja credentials.</p>
      {error && <div className="error" role="alert">{error}</div>}
      {message && <div className="success">{message}</div>}
      {loading ? <div className="panel">Loading payment settings…</div> : <form className="panel workspace-form" onSubmit={save}>
        {field("Business contact phone", contactPhone, setContactPhone, "tel", "07XXXXXXXX")}
        <div className="panelhead"><h2>M-Pesa PayBill</h2><label><input type="checkbox" checked={paybill.enabled} onChange={(e) => update("paybill", "enabled", e.target.checked)} /> Enable PayBill</label></div>
        <div className="form-grid">
          {field("PayBill number", paybill.account_number, (v) => update("paybill", "account_number", v), "text", "e.g. 123456")}
          <label className="field"><span>Daraja environment</span><select value={paybill.environment} onChange={(e) => update("paybill", "environment", e.target.value)}><option value="sandbox">Sandbox (testing)</option><option value="production">Production (live)</option></select></label>
          {field("Consumer Key", paybill.consumer_key, (v) => update("paybill", "consumer_key", v), "password", paybill.credentials_configured ? "Saved securely — leave blank to keep" : "Daraja Consumer Key")}
          {field("Consumer Secret", paybill.consumer_secret, (v) => update("paybill", "consumer_secret", v), "password", paybill.credentials_configured ? "Saved securely — leave blank to keep" : "Daraja Consumer Secret")}
          {field("Lipa na M-Pesa Passkey", paybill.passkey, (v) => update("paybill", "passkey", v), "password", paybill.credentials_configured ? "Saved securely — leave blank to keep" : "Daraja Passkey")}
        </div>
        <div className="panelhead"><h2>M-Pesa Till / Buy Goods</h2><label><input type="checkbox" checked={till.enabled} onChange={(e) => update("till", "enabled", e.target.checked)} /> Enable Till</label></div>
        <div className="form-grid">
          {field("Customer-facing Till number", till.account_number, (v) => update("till", "account_number", v), "text", "e.g. 123456")}
          {field("Store / Head Office shortcode", till.shortcode, (v) => update("till", "shortcode", v), "text", "Safaricom shortcode")}
          <label className="field"><span>Daraja environment</span><select value={till.environment} onChange={(e) => update("till", "environment", e.target.value)}><option value="sandbox">Sandbox (testing)</option><option value="production">Production (live)</option></select></label>
          {field("Consumer Key", till.consumer_key, (v) => update("till", "consumer_key", v), "password", till.credentials_configured ? "Saved securely — leave blank to keep" : "Daraja Consumer Key")}
          {field("Consumer Secret", till.consumer_secret, (v) => update("till", "consumer_secret", v), "password", till.credentials_configured ? "Saved securely — leave blank to keep" : "Daraja Consumer Secret")}
          {field("Lipa na M-Pesa Passkey", till.passkey, (v) => update("till", "passkey", v), "password", till.credentials_configured ? "Saved securely — leave blank to keep" : "Daraja Passkey")}
        </div>
        <div className="panelhead"><h2>Pochi la Biashara</h2><label><input type="checkbox" checked={pochi.enabled} onChange={(e) => update("pochi", "enabled", e.target.checked)} /> Enable Pochi</label></div>
        {field("Pochi registered phone number", pochi.account_number, (v) => update("pochi", "account_number", v), "tel", "07XXXXXXXX")}
        <p className="muted compact-help">Pochi can be shown as a manual payment option. Automatic STK Push and automatic confirmation are not included for Pochi accounts.</p>
        <p className="muted compact-help">Credentials are encrypted on the server and never returned to the browser. Leave the three credential fields blank to retain credentials already saved. Use Production only after Safaricom has approved the business's Daraja application and issued live credentials.</p>
        <div className="form-actions"><button className="btn" disabled={saving}>{saving ? "Saving…" : "Save payment settings"}</button></div>
      </form>}
    </section>
  </main></div>;
}
