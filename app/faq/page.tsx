import type { Metadata } from "next";
import { ContactCta } from "@/components/ContactCta";
import { faqs } from "@/lib/content";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers to common questions about WebWorkshop website projects.",
};

const faqTopics = [
  "Cost and payment",
  "Timing and revisions",
  "Domains and hosting",
  "Updates after launch",
];

export default function FaqPage() {
  return (
    <>
      <section className="page-hero page-hero--compact px-5 py-14 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <p className="studio-kicker">FAQ</p>
          <div className="page-hero__split">
            <h1 className="display-type">
              Questions about building your website.
            </h1>
            <div className="page-hero__index">
              <p className="studio-kicker measured-label">Answers about</p>
              <div className="editorial-index editorial-index--numbered">
                {faqTopics.map((topic, index) => (
                  <div key={topic}>
                    <b aria-hidden="true">0{index + 1}</b>
                    <span>{topic}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="faq-editorial px-5 pb-14 sm:pb-20">
        <div className="mx-auto max-w-5xl">
          {faqs.map((faq) => (
            <details className="faq-editorial__item" key={faq.question}>
              <summary>
                <span>{faq.question}</span>
                <b aria-hidden="true">+</b>
              </summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <ContactCta />
    </>
  );
}
