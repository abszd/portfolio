import { useState } from "react";
import { experience } from "../data.js";
import { openProject } from "../hooks/useHashRoute.js";
import SectionHead from "./SectionHead.jsx";

export default function Experience() {
    const [open, setOpen] = useState(experience[0].id);

    return (
        <section id="work" className="section">
            <SectionHead index="02" title="work" note={`${experience.length} roles`} />
            <ol className="rows">
                {experience.map((job, i) => {
                    const isOpen = open === job.id;
                    return (
                        <li key={job.id} className={`row exp ${isOpen ? "is-open" : ""}`} data-reveal style={{ "--d": `${i * 60}ms` }}>
                            <button
                                className="row-main"
                                aria-expanded={isOpen}
                                aria-controls={`exp-${job.id}`}
                                onClick={() => setOpen(isOpen ? null : job.id)}
                            >
                                <span className="row-year mono">{job.period}/</span>
                                <span className="row-title">
                                    <span className="sweep">{job.company}</span>
                                </span>
                                <span className="row-sub">{job.role}</span>
                                <span className="row-toggle mono" aria-hidden="true">
                                    {isOpen ? "−" : "+"}
                                </span>
                            </button>
                            <div className="row-detail" id={`exp-${job.id}`} role="region" aria-label={`${job.company} details`}>
                                <div className="row-detail-inner">
                                    <div className="exp-meta mono">
                                        <span>{job.dates}</span>
                                        {job.place && <span>{job.place}</span>}
                                        <span className="chips">
                                            {job.stack.map((s) => (
                                                <span key={s} className="chip">
                                                    {s}
                                                </span>
                                            ))}
                                        </span>
                                    </div>
                                    <ul className="exp-points">
                                        {job.points.map((pt, k) => (
                                            <li key={k}>{pt}</li>
                                        ))}
                                    </ul>
                                    {job.project && (
                                        <button className="link-arrow mono" onClick={() => openProject(job.project)}>
                                            read the build write-up
                                        </button>
                                    )}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
