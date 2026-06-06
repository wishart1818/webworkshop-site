import { pricingPlans } from "@/lib/content";
import { ButtonLink } from "./ButtonLink";

type Plan = (typeof pricingPlans)[number];

export function PricingCard({ plan }: { plan: Plan }) {
  return (
    <article
      className={`price-piece ${plan.featured ? "price-piece--featured" : ""}`}
    >
      {plan.featured ? (
        <p className="price-piece__flag">
          Best for growing businesses
        </p>
      ) : null}
      <h3 className="display-type">{plan.name}</h3>
      <p className="price-piece__price">{plan.price}</p>
      <p className="price-piece__description">{plan.description}</p>
      <ul>
        {plan.features.map((feature) => (
          <li key={feature}>
            <span aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <div className="price-piece__action">
        <ButtonLink href="/contact" variant={plan.featured ? "primary" : "secondary"}>
          Choose {plan.name}
        </ButtonLink>
      </div>
    </article>
  );
}
