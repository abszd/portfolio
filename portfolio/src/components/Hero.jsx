import { profile } from "../data.js";
import ReactiveName from "./ReactiveName.jsx";
import ScrambleText from "./ScrambleText.jsx";

export default function Hero({ reducedMotion }) {
    const [first, ...rest] = profile.name.split(" ");
    return (
        <section id="top" className="hero">
            <ScrambleText className="hero-meta mono" text={`portfolio / v2 · ${new Date().getFullYear()}`} duration={1100} delay={200} />
            <ReactiveName lines={[first, rest.join(" ")]} reducedMotion={reducedMotion} />
            <div className="hero-foot">
                <p className="hero-tag">{profile.tagline}</p>
                <ul className="hero-links mono">
                    <li>
                        <span className="dot-live" aria-hidden="true" /> {profile.role.toLowerCase()} @ skyward
                    </li>
                    {profile.links.map((l) => (
                        <li key={l.label}>
                            <a href={l.url} target="_blank" rel="noreferrer" className="link-arrow">
                                {l.label}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
            <a
                className="scroll-cue mono"
                href="#about"
                onClick={(e) => {
                    e.preventDefault();
                    document.getElementById("about")?.scrollIntoView({ behavior: "smooth" });
                }}
            >
                <span>scroll</span>
                <span className="scroll-cue-line" aria-hidden="true" />
            </a>
        </section>
    );
}
