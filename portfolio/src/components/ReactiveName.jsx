import { useEffect, useRef } from "react";

// The hero name: each letter thickens and lifts as the cursor approaches.
// A nod to the mouse-reactive text on the original site, done with a variable font.
export default function ReactiveName({ lines, reducedMotion }) {
    const ref = useRef(null);

    useEffect(() => {
        const root = ref.current;
        if (!root || reducedMotion) return;
        const letters = [...root.querySelectorAll(".rn-letter")];
        let raf = 0;
        let mx = -1e4;
        let my = -1e4;
        let boxes = [];

        const measure = () => {
            boxes = letters.map((el) => {
                const r = el.getBoundingClientRect();
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 + window.scrollY };
            });
        };

        const paint = () => {
            raf = 0;
            letters.forEach((el, i) => {
                const b = boxes[i];
                const d = Math.hypot(mx - b.x, my + window.scrollY - b.y);
                const k = Math.max(0, 1 - d / 260);
                const e = k * k * (3 - 2 * k);
                el.style.setProperty("--w", Math.round(260 + e * 520));
                el.style.setProperty("--lift", `${(-e * 0.06).toFixed(3)}em`);
            });
        };

        const onMove = (e) => {
            mx = e.clientX;
            my = e.clientY;
            if (!raf) raf = requestAnimationFrame(paint);
        };

        measure();
        // Letters animate in on load, so measure again once they've settled.
        const settle = setTimeout(measure, 1800);
        const ro = new ResizeObserver(measure);
        ro.observe(root);
        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("resize", measure);
        return () => {
            cancelAnimationFrame(raf);
            clearTimeout(settle);
            ro.disconnect();
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("resize", measure);
        };
    }, [reducedMotion]);

    let n = 0;
    return (
        <h1 ref={ref} className="hero-name" aria-label={lines.join(" ")}>
            {lines.map((line) => (
                <span className="hero-line" key={line} aria-hidden="true">
                    {[...line].map((ch) => {
                        const i = n++;
                        return (
                            <span className="rn-letter" key={i} style={{ "--i": i }}>
                                {ch}
                            </span>
                        );
                    })}
                </span>
            ))}
        </h1>
    );
}
