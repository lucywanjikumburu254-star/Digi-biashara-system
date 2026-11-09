import Link from "next/link";

export default function Home() {
  return (
    <main>
      <header className="top">
        <Link className="logo" href="/">DIGI<em>BIASHARA</em></Link>
        <div className="toplinks">
          <Link className="btn small" href="/platform/login">Admin &amp; agent sign in</Link>
        </div>
      </header>
      <section className="wrap">
        <div className="hero">
          <div className="eyebrow">Digital Kingdom Solutions</div>
          <h1>Welcome to Digi Biashara</h1>
          <p>Sign in to manage your business, branches, sales, stock and team from one place.</p>
          <div className="actions">
            <Link className="btn" href="/login">Business owner sign in</Link>
          </div>
        </div>
        <div className="cards">
          <article className="card"><h3>Manage your branches</h3><p>Keep your business locations and teams connected.</p></article>
          <article className="card"><h3>Track sales and stock</h3><p>See business activity and inventory in one workspace.</p></article>
          <article className="card"><h3>Built for Kenyan businesses</h3><p>Designed around local business needs and Kenyan Shillings.</p></article>
        </div>
      </section>
      <footer className="footer">© {new Date().getFullYear()} Digital Kingdom Solutions · Digi Biashara</footer>
    </main>
  );
}
