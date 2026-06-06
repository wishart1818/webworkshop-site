import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How WebWorkshop handles information shared through the website.",
};

const privacyPoints = [
  {
    title: "Information you send",
    body: "Project details, contact information, and emails are used to understand your request and respond to you.",
  },
  {
    title: "How it is shared",
    body: "WebWorkshop does not sell your information. Details may pass through the email and hosting services needed to operate the website.",
  },
  {
    title: "How long it is kept",
    body: "Project conversations and related details may be kept when they are useful for providing services or maintaining business records.",
  },
  {
    title: "Questions or removal requests",
    body: "Email WebWorkshop to ask what information is held or to request removal when it is no longer needed.",
  },
];

export default function PrivacyPage() {
  return (
    <>
      <section className="page-hero page-hero--compact px-5 py-14 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <p className="studio-kicker">Privacy</p>
          <div className="page-hero__split">
            <h1 className="display-type">How we handle your information.</h1>
            <p>What we collect, why we need it, and how to ask us about it.</p>
          </div>
        </div>
      </section>

      <section className="privacy-page px-5 pb-14 sm:pb-20">
        <div className="mx-auto max-w-5xl">
          <div className="privacy-page__list">
            {privacyPoints.map((point) => (
              <article key={point.title}>
                <h2>{point.title}</h2>
                <p>{point.body}</p>
              </article>
            ))}
          </div>
          <div className="privacy-page__contact">
            <p>Questions about privacy or project information?</p>
            <a className="focus-ring project-feature__link" href="mailto:wishart1818@gmail.com">
              Email wishart1818@gmail.com
            </a>
            <Link className="focus-ring project-feature__link" href="/contact">
              Open the project request page
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
