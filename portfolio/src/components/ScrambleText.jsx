import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../hooks/useReducedMotion.js";

const GLYPHS = "!<>-_\\/[]{}=+*^?#01ABCDEFxyz";

// Decodes text left to right through random glyphs, like a terminal resolving a string.
export default function ScrambleText({ text, start = true, duration = 900, delay = 0, as: Tag = "span", className = "" }) {
    const [out, setOut] = useState(() => (start && !prefersReducedMotion() ? "" : text));
    const raf = useRef(0);

    useEffect(() => {
        if (!start) return;
        if (prefersReducedMotion()) {
            setOut(text);
            return;
        }
        let t0 = 0;
        const tick = (now) => {
            if (!t0) t0 = now;
            const p = Math.min(1, (now - t0 - delay) / duration);
            if (p < 0) {
                raf.current = requestAnimationFrame(tick);
                return;
            }
            const solved = Math.floor(p * text.length);
            let s = text.slice(0, solved);
            for (let i = solved; i < Math.min(text.length, solved + 6); i++) {
                s += text[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
            }
            setOut(s);
            if (p < 1) raf.current = requestAnimationFrame(tick);
            else setOut(text);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [text, start, duration, delay]);

    return (
        <Tag className={className} aria-label={text}>
            <span aria-hidden="true">{out || " "}</span>
        </Tag>
    );
}
