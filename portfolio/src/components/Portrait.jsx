import { useEffect, useRef } from "react";
import { hexToRgb } from "../figures/util.js";

const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
];

// Portrait rendered as an ordered (Bayer) dither in the accent gradient.
// Hovering or focusing it fades to the real photo.
export default function Portrait({ src, alt, theme }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let cancelled = false;
        const img = new Image();
        img.src = src;
        img.onload = () => {
            if (cancelled) return;
            const N = 128;
            const off = document.createElement("canvas");
            off.width = off.height = N;
            const octx = off.getContext("2d", { willReadFrequently: true });
            octx.drawImage(img, 0, 0, N, N);
            const px = octx.getImageData(0, 0, N, N).data;

            const css = getComputedStyle(document.documentElement);
            const a = hexToRgb(css.getPropertyValue("--accent-a"));
            const c = hexToRgb(css.getPropertyValue("--accent-c"));
            const light = document.documentElement.dataset.theme === "light";

            const scale = 4;
            canvas.width = canvas.height = N * scale;
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    const i = (y * N + x) * 4;
                    let lum = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
                    lum = Math.pow(lum, 0.9) * 1.15 - 0.05; // a touch more contrast
                    if (light) lum = 1 - lum;
                    const threshold = (BAYER[y % 4][x % 4] + 0.5) / 16;
                    if (lum <= threshold) continue;
                    const t = (x + y) / (2 * N);
                    ctx.fillStyle = `rgb(${a.map((v, k) => Math.round(v + (c[k] - v) * t)).join(",")})`;
                    ctx.fillRect(x * scale, y * scale, scale - 1, scale - 1);
                }
            }
        };
        return () => {
            cancelled = true;
        };
    }, [src, theme]);

    return (
        <figure className="portrait" tabIndex={0}>
            <img src={src} alt={alt} loading="lazy" />
            <canvas ref={canvasRef} aria-hidden="true" />
            <figcaption>hover to resolve</figcaption>
        </figure>
    );
}
