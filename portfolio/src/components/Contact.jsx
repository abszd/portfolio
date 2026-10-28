import { useState } from "react";
import { profile } from "../data.js";
import SectionHead from "./SectionHead.jsx";

export default function Contact() {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(profile.email);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            window.location.href = `mailto:${profile.email}`;
        }
    };

    return (
        <section id="contact" className="section contact">
            <SectionHead index="04" title="contact" />
            <p className="contact-lead" data-reveal>
                Building something hard? I'd like to hear about it.
            </p>
            <div className="contact-row" data-reveal style={{ "--d": "80ms" }}>
                <a className="contact-email" href={`mailto:${profile.email}`}>
                    <span className="sweep">{profile.email}</span>
                </a>
                <button className="copy mono" onClick={copy} aria-live="polite">
                    {copied ? "copied ✓" : "copy"}
                </button>
            </div>
            <ul className="contact-links mono" data-reveal style={{ "--d": "140ms" }}>
                {profile.links.map((l) => (
                    <li key={l.label}>
                        <a href={l.url} target="_blank" rel="noreferrer" className="link-arrow">
                            {l.label}
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );
}
