import Link from "next/link";
import type { ReactNode } from "react";

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/support", label: "Support" }
] as const;

export function LegalLinks({
  activePath,
  className,
  linkClassName
}: Readonly<{
  activePath?: (typeof LEGAL_LINKS)[number]["href"];
  className?: string;
  linkClassName?: string;
}>) {
  return (
    <nav aria-label="Legal and support" className={className}>
      {LEGAL_LINKS.map((link) => (
        <Link
          aria-current={activePath === link.href ? "page" : undefined}
          className={linkClassName}
          href={link.href}
          key={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function LegalPage({
  activePath,
  children,
  intro,
  kicker,
  title
}: Readonly<{
  activePath: (typeof LEGAL_LINKS)[number]["href"];
  children: ReactNode;
  intro: string;
  kicker: string;
  title: string;
}>) {
  return (
    <main className="legal-page">
      <div className="legal-shell">
        <header className="legal-header">
          <Link aria-label="Return to Neon Fuse" className="legal-brand" href="/">
            <span aria-hidden="true">NF</span>
            <strong>Neon Fuse</strong>
          </Link>
          <LegalLinks activePath={activePath} className="legal-nav" />
        </header>

        <article className="legal-document">
          <p className="legal-kicker">{kicker}</p>
          <h1>{title}</h1>
          <p className="legal-intro">{intro}</p>
          <p className="legal-effective">Effective September 17, 2026</p>
          <div className="legal-content">{children}</div>
        </article>

        <footer className="legal-footer">
          <span>© 2026 Spero Autem LLC</span>
          <Link href="/">Return to the arena</Link>
        </footer>
      </div>
    </main>
  );
}

export function LegalSection({
  children,
  id,
  title
}: Readonly<{ children: ReactNode; id: string; title: string }>) {
  return (
    <section aria-labelledby={`${id}-title`} id={id}>
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
    </section>
  );
}
