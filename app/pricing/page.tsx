import type { Metadata } from "next";
import { ContactCta } from "@/components/ContactCta";
import { PricingCard } from "@/components/PricingCard";
import { SectionHeader } from "@/components/SectionHeader";
import { pricingPlans } from "@/lib/content";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple WebWorkshop pricing options for Launch websites, Professional websites, and Maintenance.",
};

const included = [
  "Simple project intake",
  "Website planning and copy help",
  "Responsive build",
  "Estimate request form",
  "Basic search-friendly metadata",
  "Review the website before launch",
];

const startingPrices = [
  { name: "Launch Website", price: "From $995" },
  { name: "Professional Website", price: "From $2,495" },
  { name: "Maintenance", price: "From $99/mo" },
];

export default function PricingPage() {
  return (
    <>
      <section className="page-hero page-hero--compact px-5 py-14 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <p className="studio-kicker">Pricing</p>
          <div className="page-hero__split">
            <h1 className="display-type">
              Choose the right website package.
            </h1>
            <div className="page-hero__index">
              <p className="studio-kicker measured-label">Starting prices</p>
              <div className="editorial-index">
                {startingPrices.map((item) => (
                  <div key={item.name}>
                    <span>{item.name}</span>
                    <strong>{item.price}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pricing-page px-5 pb-14 sm:pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="pricing-preview__grid">
            {pricingPlans.map((plan) => (
              <PricingCard key={plan.name} plan={plan} />
            ))}
          </div>
        </div>
      </section>

      <section className="included-section px-5 py-14 sm:py-16">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.72fr_1.28fr]">
          <SectionHeader
            title="Every website includes the basics."
          />
          <div className="included-section__list">
            {included.map((item) => (
              <article key={item}>
                <span aria-hidden="true" />
                <h3>{item}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <ContactCta />
    </>
  );
}
