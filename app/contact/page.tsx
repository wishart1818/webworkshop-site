import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact WebWorkshop about a contractor or local business website.",
};

const firstDetails = [
  "Business type and service area",
  "Whether this is a new site or redesign",
  "Top services customers ask for",
  "Any timeline you have in mind",
];

export default function ContactPage() {
  return (
    <section className="contact-page px-5 py-14 sm:py-16">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.76fr_1.24fr]">
        <div className="contact-page__intro">
          <p className="studio-kicker">Contact</p>
          <h1 className="display-type">
            Tell us about your business.
          </h1>
          <p>
            Share what you need, and we will reply with the next steps.
          </p>
          <a className="contact-page__email focus-ring" href="mailto:wishart1818@gmail.com">
            wishart1818@gmail.com
          </a>
          <div className="contact-page__details">
            {firstDetails.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>

        <ContactForm />
      </div>
    </section>
  );
}
