/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { CSSProperties } from "react";
import type { PortfolioProject } from "@/lib/content";
import { getPortfolioPath } from "@/lib/portfolio-routes";

type ProjectFeatureProps = {
  project: PortfolioProject;
  priority?: boolean;
  showDetailLink?: boolean;
  showCopy?: boolean;
};

export function ProjectFeature({
  project,
  priority = false,
  showDetailLink = true,
  showCopy = true,
}: ProjectFeatureProps) {
  const style = {
    "--project-accent": project.preview.accent,
    "--project-dark": project.preview.dark,
    "--project-soft": project.preview.soft,
  } as CSSProperties;

  return (
    <article
      className={`project-feature ${priority ? "project-feature--priority" : ""} ${showCopy ? "" : "project-feature--preview-only"}`}
      data-project={project.slug}
      style={style}
    >
      {showCopy ? (
        <div className="project-feature__copy">
          <p className="studio-kicker measured-label">{project.industry} website preview</p>
          <h3 className="display-type">{project.company}</h3>
          <p>{project.summary}</p>
          <div className="project-feature__meta">
            {project.results.map((result) => (
              <span key={result}>{result}</span>
            ))}
          </div>
          {showDetailLink ? (
            <Link className="focus-ring project-feature__link" href={getPortfolioPath(project.slug)}>
              Open full preview
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="project-window" aria-label={`${project.company} website preview`} role="img">
        <div className="project-window__top">
          <span className="project-window__mark" aria-hidden="true">{project.company.charAt(0)}</span>
          <strong>{project.company}</strong>
          <span>{project.preview.status} preview</span>
          <div className="project-window__nav">
            {project.preview.nav.map((item) => (
              <span key={item}>{item}</span>
            ))}
            <b>{project.preview.cta}</b>
          </div>
        </div>

        <div className="project-window__hero">
          <div className="project-window__hero-photo">
            <img
              alt=""
              decoding="async"
              fetchPriority={priority ? "high" : "auto"}
              height={720}
              loading={priority ? "eager" : "lazy"}
              src={project.image}
              width={960}
            />
            <span
              aria-hidden="true"
              className="project-photo-layer"
              style={{ backgroundImage: `url("${project.photo}")` }}
            />
          </div>
          <div>
            <span className="project-window__service-area">{project.serviceArea}</span>
            <h4 className="display-type">{project.preview.headline}</h4>
            <p>{project.preview.subhead}</p>
            <b>{project.preview.cta}</b>
            <small>{project.preview.trustLine}</small>
          </div>
        </div>

        <div className="project-window__body">
          <section className="service-story">
            {project.preview.serviceCards.slice(0, 3).map((service) => (
              <article key={service.title}>
                <strong>{service.title}</strong>
                <p>{service.body}</p>
              </article>
            ))}
          </section>

          <section className="project-gallery" aria-label={`${project.company} project gallery preview`}>
            {project.preview.gallery.map((item, index) => (
              <figure className={`project-gallery__item project-gallery__item--${index + 1}`} key={item}>
                <img
                  alt=""
                  decoding="async"
                  height={720}
                  loading="lazy"
                  src={project.preview.galleryPhotos[index]}
                  width={960}
                />
                <figcaption>{item}</figcaption>
              </figure>
            ))}
          </section>

          <section className="portfolio-proofline">
            <div className="portfolio-proofline__panel">
              <strong>{project.preview.proofTitle}</strong>
              <p>{project.preview.proofText}</p>
            </div>
            {project.preview.proofPoints.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </section>

          <section className="request-path">
            <div>
              <span>Start here</span>
              <strong>{project.preview.cta}</strong>
            </div>
            <div className="request-path__fields">
              {project.preview.estimateFields.map((field) => (
                <span key={field}>{field}</span>
              ))}
              <b>Send details</b>
            </div>
          </section>
        </div>

        <div className="phone-slice" aria-label={`${project.company} mobile website preview`}>
          <div className="phone-slice__visual">
            <img alt="" decoding="async" height={720} loading="lazy" src={project.image} width={960} />
          </div>
          <strong>{project.preview.headline}</strong>
          <div>
            {project.preview.services.map((service) => (
              <b key={service}>{service}</b>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
