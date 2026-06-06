import { ButtonLink } from "./ButtonLink";

type ContactCtaProps = {
  id?: string;
};

export function ContactCta({ id }: ContactCtaProps) {
  return (
    <section className="studio-cta px-5 py-14 sm:py-20" id={id}>
      <div className="mx-auto max-w-7xl">
        <div className="studio-cta__inner">
          <p className="studio-kicker">Start a website project</p>
          <h2 className="display-type">
            Ready for a better website?
          </h2>
          <div className="studio-cta__row">
            <p>
              Tell us about your business, services, service area, and what you want the website to improve.
            </p>
            <ButtonLink href="/contact" variant="secondary">
              Send project details
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
