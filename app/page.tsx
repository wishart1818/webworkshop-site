/* eslint-disable @next/next/no-img-element */
import { ButtonLink } from "@/components/ButtonLink";
import { ContactCta } from "@/components/ContactCta";
import { PortfolioCard } from "@/components/PortfolioCard";
import { PricingCard } from "@/components/PricingCard";
import { ProjectFeature } from "@/components/ProjectFeature";
import { SectionHeader } from "@/components/SectionHeader";
import {
  benefits,
  contractorTypes,
  faqs,
  portfolioProjects,
  pricingPlans,
  processSteps,
  trustPoints,
  workingAgreement,
} from "@/lib/content";

export default function Home() {
  const [featuredProject, ...otherProjects] = portfolioProjects;
  const projectPrep = [
    "Services you want to feature",
    "Cities or counties you serve",
    "Photos of your work",
    "Your current website, if you have one",
  ];

  return (
    <>
      <section className="hero-studio px-5 pb-14 pt-10 sm:pt-14 lg:pb-16">
        <div className="mx-auto max-w-7xl">
          <div className="hero-studio__header">
            <p className="studio-kicker">WebWorkshop</p>
            <p>Modern websites for contractors and local businesses.</p>
          </div>

          <div className="hero-studio__composition">
            <div className="hero-studio__copy">
              <h1 className="display-type">
                A better website for your business.
              </h1>
              <p>
                We build fast, mobile-friendly websites that explain your services and make it easy to request a quote.
              </p>
              <div className="hero-studio__actions">
                <ButtonLink href="/#contact">Send project details</ButtonLink>
                <ButtonLink href="/#portfolio" variant="secondary">
                  View preview work
                </ButtonLink>
              </div>
              </div>

            <div className="hero-art" aria-hidden="true">
              <div className="hero-art__sheet">
                <span>What matters most</span>
                <strong>Clear services and easy contact</strong>
              </div>
              <div className="hero-art__scene">
                <img alt="" className="hero-art__brandmark" src="/brand/webworkshop-mark.png" />
                <span className="hero-art__index">Since 2026 / 01</span>
                <span className="hero-art__measure">Services / recent work / quote form</span>
              </div>
              <div className="hero-art__note">
                <b>Made for contractors</b>
                <span>Pages and tools your customers expect</span>
              </div>
            </div>
          </div>

          <div className="trust-run">
            {trustPoints.map((point) => (
              <span key={point}>{point}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="studio-proof px-5 py-14 sm:py-16">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <h2 className="display-type">
            Show customers what you do and how to reach you.
          </h2>
          <div>
            <p>
              A good website should quickly show what you do, where you work, and how someone can request an estimate.
            </p>
            <div className="studio-proof__list">
              {benefits.map((benefit) => (
                <span key={benefit.title}>{benefit.title}</span>
              ))}
            </div>
            <div className="trade-list" aria-label="Industries served">
              {contractorTypes.map((type) => (
                <span key={type}>{type}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="working-agreement px-5 py-14 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="working-agreement__intro">
            <p className="studio-kicker measured-label">How projects work</p>
            <h2 className="display-type">Know what to expect at every step.</h2>
            <p>
              We agree on the scope, share a working preview, and make the launch process clear.
            </p>
          </div>
          <div className="working-agreement__list">
            {workingAgreement.map((item, index) => (
              <article key={item.title}>
                <span aria-hidden="true">0{index + 1}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="featured-work px-5 py-14 sm:py-20" id="portfolio">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Preview work"
            title="See what your website could look like."
            description="Four sample websites for roofing, landscaping, HVAC, and plumbing businesses."
          />
          <div className="featured-work__showcase">
            <ProjectFeature priority project={featuredProject} />
          </div>
          <div className="project-stack project-stack--tight">
            {otherProjects.map((project) => (
              <PortfolioCard key={project.slug} project={project} />
            ))}
          </div>
          <div className="mt-8">
            <ButtonLink href="/portfolio/ridgeway-roofing" variant="secondary">
              Open the featured preview
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="pricing-preview px-5 py-14 sm:py-20" id="pricing">
        <div className="mx-auto max-w-7xl">
          <div className="pricing-preview__intro">
            <SectionHeader
              eyebrow="Pricing"
              title="Straightforward website packages."
            />
            <ButtonLink href="/pricing" variant="secondary">
              View pricing plans
            </ButtonLink>
          </div>
          <div className="pricing-preview__grid">
            {pricingPlans.map((plan) => (
              <PricingCard key={plan.name} plan={plan} />
            ))}
          </div>
          <div className="process-compact">
            {processSteps.map((step) => (
              <article key={step.title}>
                <h3>{step.title}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="faq-editorial home-faq px-5 py-14 sm:py-16" id="faq">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="FAQ"
            title="Questions business owners usually ask."
          />
          <div className="home-faq__layout">
            <div>
              <div className="home-faq__list">
                {faqs.slice(0, 4).map((faq) => (
                  <details className="faq-editorial__item" key={faq.question}>
                    <summary>
                      <span>{faq.question}</span>
                      <b aria-hidden="true">+</b>
                    </summary>
                    <p>{faq.answer}</p>
                  </details>
                ))}
              </div>
              <div className="mt-8">
                <ButtonLink href="/faq" variant="secondary">
                  Read all questions
                </ButtonLink>
              </div>
            </div>
            <aside className="home-faq__aside">
              <p className="studio-kicker measured-label">Helpful to have ready</p>
              <div className="editorial-index">
                {projectPrep.map((item, index) => (
                  <div key={item}>
                    <b aria-hidden="true">0{index + 1}</b>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <ButtonLink href="/#contact">Send project details</ButtonLink>
            </aside>
          </div>
        </div>
      </section>

      <ContactCta id="contact" />
    </>
  );
}
