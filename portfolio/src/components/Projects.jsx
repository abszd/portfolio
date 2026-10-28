import { useEffect, useRef, useState } from "react";
import { projects } from "../data.js";
import { openProject } from "../hooks/useHashRoute.js";
import Figure from "./Figure.jsx";
import SectionHead from "./SectionHead.jsx";

// Floating live preview of a project's figure that trails the cursor (fine pointers only).
function Preview({ project, reducedMotion }) {
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;
        let tx = x;
        let ty = y;
        let raf = 0;
        let first = true;
        const onMove = (e) => {
            tx = e.clientX;
            ty = e.clientY;
            if (first) {
                x = tx;
                y = ty;
                first = false;
            }
        };
        const loop = () => {
            x += (tx - x) * (reducedMotion ? 1 : 0.14);
            y += (ty - y) * (reducedMotion ? 1 : 0.14);
            const w = el.offsetWidth;
            const h = el.offsetHeight;
            // Sit above and to the right of the cursor so the hovered row stays readable.
            const px = Math.min(window.innerWidth - w - 16, x + 36);
            const py = Math.max(72, Math.min(window.innerHeight - h - 40, y - h - 36));
            el.style.transform = `translate3d(${px}px, ${py}px, 0)`;
            raf = requestAnimationFrame(loop);
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        raf = requestAnimationFrame(loop);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("pointermove", onMove);
        };
    }, [reducedMotion]);

    return (
        <div ref={ref} className={`preview ${project ? "is-on" : ""}`} aria-hidden="true">
            {project && (
                <>
                    <Figure key={project.id} kind={project.figure} reducedMotion={reducedMotion} />
                    <span className="preview-label mono">{project.figure}.js</span>
                </>
            )}
        </div>
    );
}

export default function Projects({ reducedMotion }) {
    const [hover, setHover] = useState(null);
    const [finePointer] = useState(() => window.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? false);

    return (
        <section id="projects" className="section">
            <SectionHead index="03" title="projects" note="click for the build log" />
            <ol className="rows" onPointerLeave={() => setHover(null)}>
                {projects.map((p, i) => (
                    <li key={p.id} className="row proj" data-reveal style={{ "--d": `${i * 60}ms` }}>
                        <a
                            className="row-main"
                            href={`#/project/${p.id}`}
                            onClick={(e) => {
                                e.preventDefault();
                                openProject(p.id);
                            }}
                            onPointerEnter={() => setHover(p)}
                            onFocus={() => setHover(null)}
                        >
                            <span className="row-year mono">{p.year}/</span>
                            <span className="row-title">
                                <span className="sweep">{p.title}</span>
                            </span>
                            <span className="row-sub">{p.tagline}</span>
                            <span className="row-meta mono">
                                <span className="status">{p.status}</span>
                                <span className="row-arrow" aria-hidden="true">
                                    →
                                </span>
                            </span>
                        </a>
                    </li>
                ))}
            </ol>
            {finePointer && <Preview project={hover} reducedMotion={reducedMotion} />}
        </section>
    );
}
