"use client";

import type { FormEvent } from "react";

const contactEmail = "wishart1818@gmail.com";

export function ContactForm() {
  function submitProjectRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const subject = "WebWorkshop project request";
    const body = [
      `Name: ${form.get("name") ?? ""}`,
      `Email: ${form.get("email") ?? ""}`,
      `Business type: ${form.get("businessType") ?? ""}`,
      `Current website: ${form.get("currentWebsite") || "Not provided"}`,
      `Budget range: ${form.get("budget") ?? ""}`,
      "",
      "Project needs:",
      `${form.get("message") ?? ""}`,
    ].join("\n");

    window.location.href = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <form
      action={`mailto:${contactEmail}?subject=WebWorkshop%20project%20request`}
      className="field-form"
      encType="text/plain"
      method="post"
      onSubmit={submitProjectRequest}
    >
      <div className="field-form__heading">
        <p className="studio-kicker">Project request</p>
        <h2 className="display-type">Tell us what you need from your website.</h2>
      </div>

      <div className="field-form__grid">
        <label>
          <span>Name</span>
          <input autoComplete="name" className="focus-ring field-control" maxLength={100} name="name" placeholder="Your name" required type="text" />
        </label>
        <label>
          <span>Email</span>
          <input autoComplete="email" className="focus-ring field-control" maxLength={254} name="email" placeholder="you@example.com" required type="email" />
        </label>
      </div>

      <div className="field-form__grid">
        <label>
          <span>Business type</span>
          <select className="focus-ring field-control" name="businessType">
            <option>Roofing</option>
            <option>Landscaping</option>
            <option>HVAC</option>
            <option>Plumbing</option>
            <option>Power washing</option>
            <option>Other local service</option>
          </select>
        </label>
        <label>
          <span>Current website</span>
          <input autoComplete="url" className="focus-ring field-control" maxLength={2048} name="currentWebsite" placeholder="Optional URL" type="url" />
        </label>
      </div>

      <label>
        <span>Budget range</span>
        <select className="focus-ring field-control" name="budget">
          <option>$699-$1,494</option>
          <option>$1,495+</option>
          <option>Website Care</option>
          <option>Not sure yet</option>
        </select>
      </label>

      <label>
        <span>Project needs</span>
        <textarea
          className="focus-ring field-control field-control--textarea"
          maxLength={3000}
          name="message"
          placeholder="Tell us about your services, service area, current website, and what you would like to improve."
          required
        />
      </label>

      <div className="field-form__footer">
        <button className="focus-ring solid-button" type="submit">
          Review and send email
        </button>
        <p>Your email app will open with these details filled in for you to review.</p>
      </div>
    </form>
  );
}
