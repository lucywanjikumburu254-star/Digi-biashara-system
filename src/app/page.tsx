import Link from "next/link";

const features = [
  { icon: "↗", title: "Sales & Invoicing", text: "Create sales, invoices and keep every transaction organised." },
  { icon: "▦", title: "Stock & Inventory", text: "Track products, stock levels, purchases and movements." },
  { icon: "♧", title: "Customer Management", text: "Keep customer details and purchase history together." },
  { icon: "◔", title: "Business Reports", text: "Understand performance with clear business reports." },
  { icon: "▣", title: "M-Pesa Integration", text: "Support convenient payments for Kenyan businesses." },
];

export default function Home() {
  return (
    <main className="db-home">
      <header className="db-header">
        <Link href="/" className="db-brand" aria-label="Digi Biashara home">
          <img src="https://res.cloudinary.com/azrvy9ub/image/upload/f_auto,q_auto,w_240/v1794349210/1793911899888.jpg" alt="Digi Biashara logo" />
        </Link>
        <nav className="db-nav" aria-label="Main navigation">
          <a className="active" href="#">Home</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#support">Support</a>
        </nav>
        <div className="db-header-actions">
          <Link className="db-login" href="/login"><span aria-hidden="true">♙</span> Login</Link>
          <Link className="db-start" href="/register"><span aria-hidden="true">➤</span> Get Started</Link>
        </div>
      </header>

      <section className="db-hero">
        <div className="db-hero-glow" />
        <div className="db-copy">
          <div className="db-eyebrow"><span>🚀</span> The Complete Business Management Solution</div>
          <h1><span className="db-3d-word">DigiBiashara</span><br/><span className="db-headline-dark">Grow Your Business</span><br/><span className="db-headline-wine">Smarter &amp; Faster</span></h1>
          <p className="db-intro">Manage your sales, stock, customers and more with ease. Built for Kenyan businesses.</p>
          <div className="db-feature-chips" aria-label="Key features">
            {features.map((feature) => (
              <a href="#features" className="db-chip" key={feature.title}>
                <span>{feature.icon}</span><small>{feature.title}</small>
              </a>
            ))}
          </div>
          <div className="db-hero-actions">
            <Link className="db-cta-primary" href="/register"><span>🚀</span> Get Started Free <b>→</b></Link>
            <a className="db-cta-secondary" href="#features"><span>▶</span> Explore Features</a>
          </div>
          <div className="db-mobile-trust"><span>✓ Secure &amp; Reliable</span><span>♧ 24/7 Support</span><span>✦ Made for Kenyan Businesses</span></div>
        </div>

        <div className="db-visual" aria-label="Shop owner using Digi Biashara">
          <div className="db-photo-frame">
            <img className="db-shop-photo" src="https://res.cloudinary.com/azrvy9ub/image/upload/f_auto,q_auto,w_1100/v1794349210/1794228429642.jpg" alt="Shop owner managing her business using a smartphone" />
          </div>
          <div className="db-float-card db-growth-card">
            <strong>Business Growth</strong>
            <div className="db-chart"><i/><i/><i/><i/><i/><b>↗</b></div>
            <small>Growing with confidence</small>
          </div>
          <div className="db-float-card db-task-card">
            <span>✓</span> Manage Stock
            <span>✓</span> Track Sales
            <span>✓</span> Get Reports
            <span>✓</span> Grow Business
          </div>
          <div className="db-orbit db-orbit-one"/>
          <div className="db-orbit db-orbit-two"/>
        </div>
      </section>

      <section className="db-trustbar" aria-label="Digi Biashara benefits">
        <div><span>🛡</span> Secure &amp; Reliable</div>
        <div><span>♧</span> 24/7 Support</div>
        <div><span>♙</span> Trusted by Kenyan Businesses</div>
        <strong>Together, Let’s Grow Your Business</strong>
      </section>

      <section className="db-features-section" id="features">
        <div className="db-section-heading">
          <span>ONE PLATFORM. MORE CONTROL.</span>
          <h2>Everything your business needs in one place</h2>
          <p>Spend less time juggling records and more time growing your business.</p>
        </div>
        <div className="db-feature-grid">
          {features.map((feature) => (
            <article className="db-feature-card" key={feature.title}>
              <span className="db-feature-icon">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
          <article className="db-feature-card">
            <span className="db-feature-icon">⌂</span>
            <h3>Multi-Branch Management</h3>
            <p>Connect your business locations and manage teams from one system.</p>
          </article>
        </div>
      </section>

      <section className="db-bottom-cta" id="pricing">
        <div><span>READY TO GROW?</span><h2>Bring your business into one smarter workspace.</h2></div>
        <Link href="/register" className="db-cta-primary">Get Started <b>→</b></Link>
      </section>
      <footer className="db-footer" id="support">
        <span>© {new Date().getFullYear()} Digital Kingdom Solutions · Digi Biashara</span>
        <span>Business management made simple.</span>
        <Link href="/login">Business Login</Link>
      </footer>
    </main>
  );
}
