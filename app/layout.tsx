import type { Metadata } from "next";
import Link from "next/link";
import { BrandIdentity } from "@/components/BrandIdentity";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/#portfolio", label: "Portfolio" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
  { href: "/#contact", label: "Contact" },
];

const footerItems = [
  ...navItems,
  { href: "/privacy", label: "Privacy" },
];

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  manifest: "/manifest.webmanifest",
  title: {
    default: "WebWorkshop | Modern Websites for Contractors",
    template: "%s | WebWorkshop",
  },
  description:
    "WebWorkshop builds modern, mobile-first websites for contractors and local service businesses.",
  keywords: [
    "contractor websites",
    "local business websites",
    "roofing website design",
    "landscaping website design",
    "HVAC website design",
    "plumbing website design",
  ],
  openGraph: {
    title: "WebWorkshop",
    description: "Modern websites for contractors and local businesses.",
    siteName: "WebWorkshop",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WebWorkshop",
    description: "Modern websites for contractors and local businesses.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: "WebWorkshop",
    url: siteUrl,
    email: "wishart1818@gmail.com",
    description: "Modern websites for contractors and local service businesses.",
    serviceType: "Web design and website maintenance",
  };

  return (
    <html lang="en">
      <body>
        <script
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
          type="application/ld+json"
        />
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <div className="site-shell">
          <header className="site-header sticky top-0 z-50 border-b border-[#24483d] bg-[#07100d]/95 backdrop-blur">
            <nav
              aria-label="Main navigation"
              className="site-header__primary mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3"
            >
              <BrandIdentity href="/" />
              <div className="hidden items-center gap-1 md:flex">
                {navItems.map((item) => (
                  <Link
                    className="focus-ring nav-link px-3 py-2 text-sm font-bold transition"
                    href={item.href}
                    key={item.href}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <Link
                className="focus-ring solid-button site-header__cta"
                href="/#contact"
              >
                Start a project
              </Link>
            </nav>
            <div className="site-header__mobile-nav border-t border-white/20 md:hidden">
              <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-5 py-2">
                {navItems.map((item) => (
                  <Link
                    className="focus-ring shrink-0 px-3 py-2 text-sm font-bold text-white"
                    href={item.href}
                    key={item.href}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </header>
          <main id="main-content">{children}</main>
          <footer className="border-t border-[#101713] bg-[#101713] text-white">
            <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-[1.3fr_0.7fr_0.7fr]">
              <div>
                <BrandIdentity tone="dark" showTagline={false} />
                <p className="mt-3 max-w-md text-sm leading-6 text-[#d9e3dd]">
                  Modern websites that help contractors and local businesses explain their services and
                  make it easy for customers to get in touch.
                </p>
                <a className="footer-email" href="mailto:wishart1818@gmail.com">
                  wishart1818@gmail.com
                </a>
              </div>
              <div>
                <p className="text-sm font-bold">Pages</p>
                <div className="mt-3 grid gap-2 text-sm text-[#d9e3dd]">
                  {footerItems.map((item) => (
                    <Link className="hover:text-white" href={item.href} key={item.href}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-bold">Built For</p>
                <p className="mt-3 text-sm leading-6 text-[#d9e3dd]">
                  Roofers, landscapers, HVAC companies, plumbers, pressure washing teams, and local service
                  businesses.
                </p>
              </div>
            </div>
            <div className="footer-fineprint mx-auto max-w-7xl px-5 pb-8">
              <span>Independent web design studio for contractors and local businesses.</span>
              <span>WebWorkshop © {new Date().getFullYear()}</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
