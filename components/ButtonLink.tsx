import Link from "next/link";

type ButtonLinkProps = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
};

export function ButtonLink({ href, children, variant = "primary", className = "" }: ButtonLinkProps) {
  const classes = `focus-ring ${variant === "primary" ? "solid-button" : "outline-button"} ${className}`;

  return (
    <Link className={classes} href={href}>
      {children}
    </Link>
  );
}
