/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

type BrandIdentityProps = {
  href?: string;
  tone?: "light" | "dark";
  showTagline?: boolean;
};

export function BrandIdentity({
  href,
  tone = "light",
  showTagline = true,
}: BrandIdentityProps) {
  const source = showTagline
    ? "/brand/webworkshop-wordmark.png"
    : "/brand/webworkshop-full.png";

  const content = (
    <span
      className={`brand-identity brand-identity--${tone} ${
        showTagline ? "brand-identity--wordmark" : "brand-identity--full"
      }`}
    >
      <img alt="WebWorkshop" height={showTagline ? 212 : 602} src={source} width={1280} />
    </span>
  );

  if (!href) {
    return content;
  }

  return (
    <Link className="focus-ring rounded-sm" href={href}>
      {content}
    </Link>
  );
}
