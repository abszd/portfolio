import { profile } from "../data.js";
import Portrait from "./Portrait.jsx";
import SectionHead from "./SectionHead.jsx";

export default function About({ theme }) {
    return (
        <section id="about" className="section">
            <SectionHead index="01" title="about" />
            <div className="about-grid">
                <div className="about-copy" data-reveal>
                    {profile.bio.map((p, i) => (
                        <p key={i} className={i === 0 ? "lead" : ""}>
                            {p}
                        </p>
                    ))}
                    <dl className="facts mono">
                        {profile.facts.map(([k, v]) => (
                            <div key={k}>
                                <dt>{k}</dt>
                                <dd>{v}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
                <div className="about-side" data-reveal style={{ "--d": "120ms" }}>
                    <Portrait src={`${import.meta.env.BASE_URL}me.jpeg`} alt={`Portrait of ${profile.name}`} theme={theme} />
                </div>
            </div>
            <dl className="skills" data-reveal>
                {profile.skills.map(([k, v]) => (
                    <div key={k}>
                        <dt className="mono">{k}</dt>
                        <dd>{v}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
