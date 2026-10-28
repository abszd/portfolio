import { mono, rand, rgba, ramp } from "./util.js";

// ViralBear: a vertical split-screen edit with captions timed word by word,
// next to the transcript timeline that drives them.
const SENTENCE = "every word gets its own timestamp so the captions land right on the beat".split(" ");

function timeline() {
    let at = 0.4;
    return SENTENCE.map((word) => {
        const dur = 0.16 + word.length * 0.045 + rand(0, 0.08);
        const w = { word, start: at, end: at + dur };
        at += dur + rand(0.02, 0.12);
        return w;
    });
}

export default function captions() {
    let words = timeline();
    let t = 0;
    let total = words[words.length - 1].end + 1.2;

    const wave = Array.from({ length: 160 }, (_, i) => 0.5 + 0.5 * Math.sin(i * 0.7) * Math.sin(i * 0.13 + 1));

    return {
        step(dt) {
            t += dt;
            if (t > total) {
                words = timeline();
                total = words[words.length - 1].end + 1.2;
                t = 0;
            }
        },
        draw(ctx, w, h, p) {
            const pad = 18;
            const phoneH = h - pad * 2;
            const phoneW = Math.round(phoneH * (9 / 16));
            const px = w < 480 ? pad : pad + 10;
            const py = pad;
            const r = 14;

            // Phone frame.
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(px, py, phoneW, phoneH, r);
            ctx.clip();
            ctx.fillStyle = rgba(p.fg, 0.04);
            ctx.fillRect(px, py, phoneW, phoneH);

            // Top: the source clip, panned up. Abstract moving bands.
            const split = py + phoneH * 0.55;
            for (let i = 0; i < 6; i++) {
                const y = py + 10 + i * ((split - py - 20) / 6) + Math.sin(t * 1.3 + i) * 4;
                ctx.fillStyle = ramp(p, i / 5, 0.18 + 0.05 * i);
                ctx.fillRect(px + 8, y, phoneW - 16 - ((i * 23) % 40), 10);
            }
            // Bottom: background gameplay, scrolling lanes.
            ctx.fillStyle = rgba(p.fg, 0.06);
            ctx.fillRect(px, split, phoneW, py + phoneH - split);
            for (let i = 0; i < 3; i++) {
                const lx = px + (phoneW / 3) * i + phoneW / 6;
                for (let k = 0; k < 6; k++) {
                    const y = split + ((k * 26 + t * 90) % (py + phoneH - split + 20)) - 10;
                    ctx.fillStyle = rgba(p.fg, 0.18);
                    ctx.fillRect(lx - 1, y, 2, 12);
                }
            }
            ctx.restore();
            ctx.strokeStyle = rgba(p.fg, 0.35);
            ctx.beginPath();
            ctx.roundRect(px + 0.5, py + 0.5, phoneW - 1, phoneH - 1, r);
            ctx.stroke();

            // Burned-in caption on the seam.
            const active = words.find((wd) => t >= wd.start && t < wd.end);
            if (active) {
                const k = Math.min(1, (t - active.start) / 0.08);
                const size = Math.max(14, Math.round(phoneW / 7.5));
                ctx.font = `700 ${size * (0.85 + 0.15 * k)}px "Inter Tight", system-ui, sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.lineWidth = 4;
                ctx.strokeStyle = rgba("#000000", 0.7);
                ctx.strokeText(active.word.toUpperCase(), px + phoneW / 2, split);
                ctx.fillStyle = "#ffffff";
                ctx.fillText(active.word.toUpperCase(), px + phoneW / 2, split);
                ctx.textAlign = "left";
            }

            // Timeline on the right.
            const tx = px + phoneW + 24;
            const tw = w - tx - pad;
            if (tw < 120) return;
            const scale = tw / total;
            const waveY = py + phoneH * 0.32;
            const waveH = phoneH * 0.22;

            mono(ctx, 11, rgba(p.fg, 0.55));
            ctx.textBaseline = "top";
            ctx.fillText("whisper · word timestamps", tx, py);

            // Waveform: louder while a word is being spoken.
            const bars = wave.length;
            const bw = tw / bars;
            for (let i = 0; i < bars; i++) {
                const time = (i / bars) * total;
                const speaking = words.some((wd) => time >= wd.start && time < wd.end);
                const amp = (speaking ? 0.35 + 0.65 * wave[i] : 0.06 + 0.05 * wave[i]) * waveH;
                ctx.fillStyle = time < t ? ramp(p, i / bars, 0.85) : rgba(p.fg, 0.2);
                ctx.fillRect(tx + i * bw, waveY - amp / 2, Math.max(1, bw - 1), amp);
            }

            // Word chips.
            const rowH = 18;
            let row = 0;
            let lastEnd = -1;
            for (const wd of words) {
                const x = tx + wd.start * scale;
                if (x < lastEnd + 2) row = (row + 1) % 3;
                else row = 0;
                const y = waveY + waveH * 0.7 + row * (rowH + 4);
                const cw = Math.max(4, (wd.end - wd.start) * scale);
                const on = t >= wd.start && t < wd.end;
                const past = t >= wd.end;
                ctx.fillStyle = on ? rgba(p.c, 0.9) : past ? rgba(p.b, 0.3) : rgba(p.fg, 0.08);
                ctx.fillRect(x, y, cw, rowH);
                mono(ctx, 9, on ? p.bg : rgba(p.fg, past ? 0.75 : 0.45));
                ctx.textBaseline = "middle";
                ctx.save();
                ctx.beginPath();
                ctx.rect(x, y, cw, rowH);
                ctx.clip();
                ctx.fillText(wd.word, x + 3, y + rowH / 2 + 0.5);
                ctx.restore();
                lastEnd = x + Math.max(cw, ctx.measureText(wd.word).width + 6);
            }

            // Playhead.
            const hx = tx + t * scale;
            ctx.strokeStyle = rgba(p.fg, 0.8);
            ctx.beginPath();
            ctx.moveTo(hx + 0.5, waveY - waveH * 0.7);
            ctx.lineTo(hx + 0.5, py + phoneH - 4);
            ctx.stroke();
            mono(ctx, 10, rgba(p.fg, 0.6));
            ctx.textBaseline = "bottom";
            ctx.fillText(`${t.toFixed(2)}s`, Math.min(hx + 4, w - pad - 40), waveY - waveH * 0.7);
        },
    };
}
