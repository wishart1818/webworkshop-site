/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { PortfolioProject } from "@/lib/content";
import { getPortfolioPath } from "@/lib/portfolio-routes";

export function PortfolioCard({ project }: { project: PortfolioProject }) {
  return (
    <article
      className="portfolio-tile"
      data-project={project.slug}
      style={{
        "--project-accent": project.preview.accent,
        "--project-dark": project.preview.dark,
        "--project-soft": project.preview.soft,
      } as React.CSSProperties}
    >
      <Link
        aria-label={`Open the ${project.company} full website preview`}
        className="focus-ring portfolio-tile__visual"
        href={getPortfolioPath(project.slug)}
      >
        <span className="portfolio-tile__chrome">
          <b>{project.company}</b>
          <span>{project.preview.status} / {project.preview.nav.slice(0, 2).join(" / ")}</span>
        </span>
        <img
          alt={`${project.company} website preview`}
          decoding="async"
          height={720}
          loading="lazy"
          src={project.image}
          width={960}
        />
        <span
          aria-hidden="true"
          className="project-photo-layer"
          style={{ backgroundImage: `url("${project.photo}")` }}
        />
        <span className="portfolio-tile__screen">
          <b>{project.serviceArea}</b>
          <strong className="display-type">{project.preview.headline}</strong>
          <span>{project.preview.cta}</span>
        </span>
      </Link>
      <div className="portfolio-tile__copy">
        <p className="studio-kicker measured-label">{project.industry} website preview</p>
        <div>
          <h3 className="display-type">{project.company}</h3>
          <p>{project.summary}</p>
        </div>
        <Link className="focus-ring project-feature__link" href={getPortfolioPath(project.slug)}>
          Open full preview
        </Link>
      </div>
    </article>
  );
}
