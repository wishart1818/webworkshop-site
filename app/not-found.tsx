import { ButtonLink } from "@/components/ButtonLink";

export default function NotFound() {
  return (
    <section className="not-found px-5 py-14 sm:py-20">
      <div className="mx-auto max-w-7xl">
        <p className="studio-kicker measured-label">404 / Page not found</p>
        <div className="not-found__grid">
          <h1 className="display-type">We could not find that page.</h1>
          <div>
            <p>The link may be outdated, or the page may have moved.</p>
            <div className="not-found__actions">
              <ButtonLink href="/">Return home</ButtonLink>
              <ButtonLink href="/#portfolio" variant="secondary">
                View preview work
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
