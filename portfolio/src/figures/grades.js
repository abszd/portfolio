import { lerp, mono, rand, rgba, ramp } from "./util.js";

// Badger Grades: grade-distribution bars morphing between sample courses, with the
// breadth-requirement bitmask that turns any checkbox combination into one query.
const GRADES = ["A", "AB", "B", "BC", "C", "D", "F"];
const POINTS = [4, 3.5, 3, 2.5, 2, 1, 0];
// Ordered most-significant bit first so each box lines up with its binary digit (BIO = 1 … SOC = 32).
const BREADTHS = ["SOC", "PHY", "NAT", "LIT", "HUM", "BIO"];

function distribution() {
    const mu = rand(2.6, 3.85);
    const sigma = rand(0.45, 0.85);
    const raw = POINTS.map((g) => Math.exp(-((g - mu) ** 2) / (2 * sigma * sigma)) * rand(0.8, 1.2));
    const sum = raw.reduce((a, b) => a + b, 0);
    return raw.map((v) => v / sum);
}

export default function grades() {
    let current = distribution();
    let target = distribution();
    let mask = 0;
    let t = 0;

    function next() {
        target = distribution();
        do mask = Math.floor(rand(1, 64));
        while (mask === 0);
        t = 0;
    }
    next();

    return {
        step(dt) {
            t += dt;
            const k = 1 - Math.exp(-dt * 5);
            current = current.map((v, i) => lerp(v, target[i], k));
            if (t > 3) next();
        },
        draw(ctx, w, h, p) {
            const pad = 18;
            const top = 40;
            const bottom = 64;
            const chartH = h - top - bottom;
            const gap = 10;
            const bw = (w - pad * 2 - gap * (GRADES.length - 1)) / GRADES.length;
            const max = 0.55;

            ctx.strokeStyle = rgba(p.fg, 0.08);
            for (let i = 0; i <= 4; i++) {
                const y = top + chartH - (chartH * i) / 4 + 0.5;
                ctx.beginPath();
                ctx.moveTo(pad, y);
                ctx.lineTo(w - pad, y);
                ctx.stroke();
            }

            current.forEach((v, i) => {
                const bh = Math.min(1, v / max) * chartH;
                const x = pad + i * (bw + gap);
                const y = top + chartH - bh;
                ctx.fillStyle = ramp(p, i / (GRADES.length - 1), 0.7);
                ctx.fillRect(x, y, bw, bh);
                ctx.fillStyle = ramp(p, i / (GRADES.length - 1), 1);
                ctx.fillRect(x, y, bw, 2);
                mono(ctx, 10, rgba(p.fg, 0.7));
                ctx.textBaseline = "top";
                ctx.textAlign = "center";
                ctx.fillText(GRADES[i], x + bw / 2, top + chartH + 6);
                ctx.fillStyle = rgba(p.fg, 0.45);
                ctx.textBaseline = "bottom";
                if (bw > 26) ctx.fillText(`${Math.round(v * 100)}%`, x + bw / 2, y - 4);
            });
            ctx.textAlign = "left";

            const gpa = current.reduce((s, v, i) => s + v * POINTS[i], 0);
            mono(ctx, 11, rgba(p.fg, 0.55));
            ctx.textBaseline = "top";
            ctx.fillText("sample distribution", pad, 12);
            const label = `avg GPA ${gpa.toFixed(2)}`;
            ctx.fillStyle = rgba(p.fg, 0.9);
            ctx.fillText(label, w - pad - ctx.measureText(label).width, 12);

            // Bitmask row.
            const by = h - 30;
            const cw = Math.min(46, (w - pad * 2 - 150) / BREADTHS.length);
            BREADTHS.forEach((b, i) => {
                const bit = BREADTHS.length - 1 - i;
                const on = (mask >> bit) & 1;
                const x = pad + i * cw;
                ctx.fillStyle = on ? rgba(p.b, 0.85) : rgba(p.fg, 0.06);
                ctx.fillRect(x, by, cw - 4, 18);
                mono(ctx, 9, on ? p.bg : rgba(p.fg, 0.45), 500);
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(b, x + (cw - 4) / 2, by + 9.5);
            });
            ctx.textAlign = "left";
            mono(ctx, 11, rgba(p.fg, 0.8));
            const bits = mask.toString(2).padStart(6, "0");
            ctx.fillText(`= 0b${bits} (${mask})`, pad + BREADTHS.length * cw + 6, by + 9.5);
        },
    };
}
