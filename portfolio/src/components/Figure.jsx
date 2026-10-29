import { useEffect, useRef } from "react";
import { figures } from "../figures/index.js";

function palette() {
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    return { bg: v("--bg"), fg: v("--fg"), a: v("--accent-a"), b: v("--accent-b"), c: v("--accent-c"), d: v("--accent-d") };
}

// Hosts one generative figure on a canvas: handles DPR sizing, theme colours,
// pausing while off-screen, and reduced motion (simulate ahead, draw a single frame).
export default function Figure({ kind, reducedMotion, className = "", label }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const make = figures[kind];
        if (!canvas || !make) return;
        const ctx = canvas.getContext("2d");
        const fig = make();
        let w = 0;
        let h = 0;
        let raf = 0;
        let visible = false;
        let last = performance.now();
        let colors = palette();

        const draw = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);
            fig.draw(ctx, w, h, colors);
        };

        const loop = (now) => {
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;
            fig.step(dt, w, h);
            draw();
            raf = requestAnimationFrame(loop);
        };

        const start = () => {
            cancelAnimationFrame(raf);
            if (!w || !h) return;
            if (reducedMotion) {
                // Advance the simulation to an interesting state, then hold still.
                for (let i = 0; i < 180; i++) fig.step(1 / 60, w, h);
                draw();
                return;
            }
            if (visible) {
                last = performance.now();
                raf = requestAnimationFrame(loop);
            }
        };

        const ro = new ResizeObserver(([entry]) => {
            const box = entry.contentRect;
            w = Math.round(box.width);
            h = Math.round(box.height);
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            fig.step(0, w, h);
            draw();
            start();
        });
        ro.observe(canvas);

        // Figures that load data first (BabyBot's weights) expose a `ready` promise.
        let disposed = false;
        fig.ready?.then(() => {
            if (disposed || !w || !h) return;
            draw();
            start();
        });

        const io = new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            if (visible) start();
            else cancelAnimationFrame(raf);
        });
        io.observe(canvas);

        const onTheme = () => {
            colors = palette();
            if (reducedMotion || !visible) draw();
        };
        window.addEventListener("themechange", onTheme);

        return () => {
            disposed = true;
            cancelAnimationFrame(raf);
            ro.disconnect();
            io.disconnect();
            window.removeEventListener("themechange", onTheme);
        };
    }, [kind, reducedMotion]);

    return <canvas ref={canvasRef} className={`figure ${className}`} role="img" aria-label={label} />;
}
