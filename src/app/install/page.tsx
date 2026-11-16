import Link from "next/link";
import BrandLogo from "@/components/brand-logo";
import ShareAppButton from "@/components/share-app-button";

export const metadata = {
  title: "Install Digi Biashara",
  description: "Open Digi Biashara or install it on your phone, tablet or computer.",
};

export default function InstallPage() {
  return (
    <main className="install-page">
      <header className="top install-top">
        <BrandLogo />
        <span className="muted">Business management</span>
      </header>
      <section className="install-content">
        <div className="authbox install-card">
          <div className="eyebrow">Digi Biashara</div>
          <h1>Your business, ready when you are.</h1>
          <p className="muted">Use the same Digi Biashara system on your phone, tablet or computer. Your account, business records and permissions stay connected to the existing platform.</p>
          <div className="install-actions">
            <Link className="btn" href="/login">Open Digi Biashara</Link>
            <ShareAppButton />
          </div>
          <div className="install-steps">
            <h2>Install on your device</h2>
            <div className="install-step">
              <strong>Android phones</strong>
              <p>Open this page in Chrome, tap Install Digi Biashara when prompted, or use the browser menu and choose “Install app” or “Add to Home screen”.</p>
            </div>
            <div className="install-step">
              <strong>iPhone and iPad</strong>
              <p>Open this page in Safari, tap the Share icon, choose “Add to Home Screen”, then tap “Add”.</p>
            </div>
            <div className="install-step">
              <strong>Windows and desktop computers</strong>
              <p>Open this page in a supported browser such as Chrome or Edge, then select the install icon in the address bar or browser menu.</p>
            </div>
          </div>
          <p className="install-note">Installation is optional. You can also use Digi Biashara directly in your browser. An internet connection is required for live business records and transactions.</p>
        </div>
      </section>
    </main>
  );
}
