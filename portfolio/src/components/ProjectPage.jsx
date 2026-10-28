import { useEffect, useRef } from "react";
import Markdown from "react-markdown";
import { projects } from "../data.js";
import { closeProject, openProject } from "../hooks/useHashRoute.js";
import Figure from "./Figure.jsx";
import ScrambleText from "./ScrambleText.jsx";

export default function ProjectPage({ id, reducedMotion }) {
    const index = projects.findIndex((p) => p.id === id);
    const project = projects[index];
    const scroller = useRef(null);

    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && closeProject();
        window.addEventListener("keydown", onKey);
        document.body.classList.add("is-locked");
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.classList.remove("is-locked");
        };
    }, []);

    useEffect(() => {
        scroller.current?.scrollTo({ top: 0 });
        scroller.current?.focus({ preventScroll: true });
        if (project) document.title = `${project.title} · Arian Abbaszadeh`;
        return () => {
            document.title = "Arian Abbaszadeh";
        };
    }, [id, project]);

    if (!project) {
        return (
            <div className="project-page" role="dialog" aria-modal="true" aria-label="Project not found">
                <div className="project-inner">
                    <button className="back mono" onClick={closeProject}>
                        ← back
                    </button>
                    <h1 className="project-title">Not found</h1>
                </div>
            </div>
        );
    }

    const prev = projects[(index - 1 + projects.length) % projects.length];
    const next = projects[(index + 1) % projects.length];

    return (
        <div className="project-page" role="dialog" aria-modal="true" aria-labelledby="project-title" ref={scroller} tabIndex={-1}>
            <div className="project-inner" key={project.id}>
                <div className="project-bar mono">
                    <button className="back" onClick={closeProject}>
                        ← index
                    </button>
                    <span className="crumbs">
                        projects / {String(index + 1).padStart(2, "0")} of {String(projects.length).padStart(2, "0")}
                    </span>
                    <span className="esc">esc</span>
                </div>

                <header className="project-head">
                    <div className="project-kicker mono">
                        <span>{project.year}</span>
                        <span className="status">{project.status}</span>
                    </div>
                    <h1 id="project-title" className="project-title">
                        <ScrambleText text={project.title} duration={650} />
                    </h1>
                    <p className="project-tagline">{project.tagline}</p>
                    <div className="project-meta">
                        <div className="chips mono">
                            {project.stack.map((s) => (
                                <span key={s} className="chip">
                                    {s}
                                </span>
                            ))}
                        </div>
                        {project.links.length > 0 && (
                            <div className="project-links mono">
                                {project.links.map((l) => (
                                    <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="link-arrow">
                                        {l.label}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                </header>

                <figure className="project-figure">
                    <div className="project-figure-frame">
                        <Figure kind={project.figure} reducedMotion={reducedMotion} label={project.figureCaption} />
                        <span className="corner tl" />
                        <span className="corner tr" />
                        <span className="corner bl" />
                        <span className="corner br" />
                    </div>
                    <figcaption className="mono">
                        <span>fig. {String(index + 1).padStart(2, "0")}</span> {project.figureCaption}
                    </figcaption>
                </figure>

                <dl className="metrics">
                    {project.metrics.map(([k, v]) => (
                        <div key={k}>
                            <dt className="mono">{k}</dt>
                            <dd>{v}</dd>
                        </div>
                    ))}
                </dl>

                <article className="prose">
                    <Markdown
                        components={{
                            a: ({ href, children }) => (
                                <a href={href} target="_blank" rel="noreferrer">
                                    {children}
                                </a>
                            ),
                        }}
                    >
                        {project.body}
                    </Markdown>
                </article>

                <nav className="project-nav" aria-label="More projects">
                    <button onClick={() => openProject(prev.id, { replace: true })}>
                        <span className="mono">← prev</span>
                        <span className="sweep">{prev.title}</span>
                    </button>
                    <button onClick={() => openProject(next.id, { replace: true })}>
                        <span className="mono">next →</span>
                        <span className="sweep">{next.title}</span>
                    </button>
                </nav>
            </div>
        </div>
    );
}
