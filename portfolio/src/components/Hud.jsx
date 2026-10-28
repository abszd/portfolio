import { useEffect, useRef } from "react";
import { stats } from "../stats.js";
import { SECTIONS } from "./Nav.jsx";

// Corner readouts: cursor position, frame rate and shader clock, plus scroll progress.
// Written straight to the DOM on an interval so React never re-renders for them.
export default function Hud({ active }) {
    const left = useRef(null);
    const bar = useRef(null);

    useEffect(() => {
        const id = setInterval(() => {
            if (left.current) {
                const fps = stats.fps ? `${String(stats.fps).padStart(2, "0")} fps` : "static";
                left.current.textContent = `x ${stats.x.toFixed(3)}  y ${stats.y.toFixed(3)}  ·  ${fps}  ·  t ${stats.time.toFixed(1)}s`;
            }
        }, 120);
        const onScroll = () => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            const p = max > 0 ? window.scrollY / max : 0;
            if (bar.current) bar.current.style.transform = `scaleY(${p})`;
        };
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            clearInterval(id);
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    }, []);

    const idx = SECTIONS.findIndex((s) => s.id === active);

    return (
        <div className="hud" aria-hidden="true">
            <div className="hud-left mono" ref={left} />
            <div className="hud-right mono">
                {idx >= 0 ? `0${idx + 1} / 0${SECTIONS.length}  ${SECTIONS[idx].label}` : `00 / 0${SECTIONS.length}  index`}
            </div>
            <div className="hud-rail">
                <div className="hud-rail-fill" ref={bar} />
            </div>
        </div>
    );
}
