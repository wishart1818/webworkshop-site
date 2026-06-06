import { notFound } from "next/navigation";
import { ButtonLink } from "./ButtonLink";
import { ContactCta } from "./ContactCta";
import { ProjectFeature } from "./ProjectFeature";
import type { PortfolioProject } from "@/lib/portfolio";

type PortfolioDetailPageProps = {
  project: PortfolioProject | undefined;
};

export function PortfolioDetailPage({ project }: PortfolioDetailPageProps) {
  if (!project) {
    notFound();
  }

  return (
    <>
      <section className="portfolio-detail-hero px-5 py-14 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <p className="studio-kicker">{project.industry} preview</p>
          <div className="portfolio-detail-hero__grid">
            <div>
              <h1 className="display-type">{project.company}</h1>
              <p>{project.focus}</p>
              <div className="portfolio-detail-hero__actions">
                <ButtonLink href="/contact">Request a similar site</ButtonLink>
                <ButtonLink href="/#portfolio" variant="secondary">
                  Back to portfolio
                </ButtonLink>
              </div>
            </div>
            <aside aria-label={`${project.company} site priorities`}>
              {project.results.map((result) => (
                <span key={result}>{result}</span>
              ))}
            </aside>
          </div>
        </div>
      </section>

      <section className="portfolio-detail-showcase px-5 pb-14 sm:pb-20">
        <div className="mx-auto max-w-7xl">
          <ProjectFeature project={project} showCopy={false} showDetailLink={false} />
        </div>
      </section>

      <section className="portfolio-detail-proof px-5 py-14 sm:py-16">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.72fr_1.28fr]">
          <div>
            <p className="studio-kicker">What the preview includes</p>
            <h2 className="display-type">What customers need before they call.</h2>
          </div>
          <div className="portfolio-detail-proof__grid">
            <article>
              <h3>Services</h3>
              <ul>
                {project.preview.services.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article>
              <h3>Service areas</h3>
              <ul>
                {project.preview.serviceAreas.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article>
              <h3>Quote request</h3>
              <ul>
                {project.preview.estimateFields.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article>
              <h3>Customer questions</h3>
              <ul>
                {project.preview.faqs.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <ContactCta />
    </>
  );
}
