import { TAU, mono, rand, rgba, ramp } from "./util.js";

// Systems coursework (and AriDB's buffer pool): clock replacement over a ring of frames
// with pin counts, dirty bits and reference bits.
const FRAMES = 12;
const PAGES = 28;

export default function clock() {
    const frames = Array.from({ length: FRAMES }, () => ({ page: null, ref: false, dirty: false, pin: 0, flash: 0 }));
    let hand = 0;
    let handAngle = 0;
    let queue = []; // pending hand steps to animate
    let log = [];
    let t = 0;
    let hits = 0;
    let misses = 0;

    // Skewed access pattern so some pages stay hot and hits actually happen.
    const request = () => Math.min(PAGES - 1, Math.floor(Math.pow(Math.random(), 2.2) * PAGES));

    function access() {
        const page = request();
        const write = Math.random() < 0.3;
        const at = frames.findIndex((f) => f.page === page);
        if (at >= 0) {
            hits++;
            frames[at].ref = true;
            frames[at].dirty ||= write;
            frames[at].flash = 1;
            push(`read p${page} → hit f${at}`);
            return;
        }
        misses++;
        // Walk the hand: skip pinned frames, give referenced frames a second chance.
        for (let guard = 0; guard < FRAMES * 3; guard++) {
            const f = frames[hand];
            if (f.page === null) break;
            if (f.pin > 0) {
                queue.push({ frame: hand, action: "skip" });
            } else if (f.ref) {
                queue.push({ frame: hand, action: "clear" });
            } else {
                break;
            }
            hand = (hand + 1) % FRAMES;
        }
        const victim = frames[hand];
        const evicted = victim.page;
        const flushed = evicted !== null && victim.dirty;
        queue.push({ frame: hand, action: "load", page, write, evicted, flushed });
        hand = (hand + 1) % FRAMES;
    }

    function push(line) {
        log.unshift(line);
        log = log.slice(0, 6);
    }

    function apply(stepItem) {
        const f = frames[stepItem.frame];
        if (stepItem.action === "clear") f.ref = false;
        if (stepItem.action === "load") {
            const { page, write, evicted, flushed } = stepItem;
            f.page = page;
            f.ref = true;
            f.dirty = write;
            f.pin = Math.random() < 0.15 ? 1 + Math.floor(rand(0, 3)) : 0;
            f.flash = 1;
            push(
                evicted === null
                    ? `read p${page} → miss, f${stepItem.frame} free`
                    : `read p${page} → miss, evict p${evicted}${flushed ? " (flush)" : ""}`
            );
        }
    }

    let stepT = 0;
    return {
        step(dt) {
            t += dt;
            frames.forEach((f) => (f.flash = Math.max(0, f.flash - dt * 1.5)));
            if (queue.length) {
                stepT += dt;
                const target = queue[0].frame;
                const goal = (target / FRAMES) * TAU;
                let diff = goal - (handAngle % TAU);
                if (diff < -0.001) diff += TAU;
                handAngle += Math.min(diff, dt * 7);
                if (diff < 0.02 && stepT > 0.18) {
                    apply(queue.shift());
                    stepT = 0;
                }
            } else if (t > 0.9) {
                t = 0;
                // Pins are released over time.
                frames.forEach((f) => f.pin > 0 && Math.random() < 0.3 && f.pin--);
                access();
            }
        },
        draw(ctx, w, h, p) {
            const narrow = w < 520;
            const cx = narrow ? w / 2 : w * 0.33;
            const cy = narrow ? h * 0.42 : h / 2 + 6;
            const R = Math.min(narrow ? h * 0.32 : h * 0.38, narrow ? w * 0.38 : w * 0.26);
            const box = Math.max(26, R * 0.36);

            ctx.strokeStyle = rgba(p.fg, 0.1);
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, TAU);
            ctx.stroke();

            frames.forEach((f, i) => {
                const a = (i / FRAMES) * TAU - Math.PI / 2;
                const x = cx + Math.cos(a) * R;
                const y = cy + Math.sin(a) * R;
                ctx.fillStyle = f.page === null ? rgba(p.fg, 0.03) : ramp(p, f.page / PAGES, 0.14 + f.flash * 0.5);
                ctx.fillRect(x - box / 2, y - box / 2, box, box);
                ctx.strokeStyle = f.pin > 0 ? rgba(p.fg, 0.9) : rgba(p.fg, 0.3);
                ctx.lineWidth = f.pin > 0 ? 2 : 1;
                ctx.strokeRect(x - box / 2 + 0.5, y - box / 2 + 0.5, box - 1, box - 1);
                ctx.lineWidth = 1;
                if (f.dirty) {
                    ctx.fillStyle = rgba(p.c, 0.95);
                    ctx.beginPath();
                    ctx.moveTo(x + box / 2, y - box / 2);
                    ctx.lineTo(x + box / 2 - 9, y - box / 2);
                    ctx.lineTo(x + box / 2, y - box / 2 + 9);
                    ctx.fill();
                }
                if (f.ref) {
                    ctx.fillStyle = rgba(p.a, 1);
                    ctx.beginPath();
                    ctx.arc(x - box / 2 + 6, y + box / 2 - 6, 2.5, 0, TAU);
                    ctx.fill();
                }
                mono(ctx, 10, rgba(p.fg, f.page === null ? 0.3 : 0.9), 500);
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(f.page === null ? "—" : `p${f.page}`, x, y);
                ctx.textAlign = "left";
            });

            // Hand.
            const ha = handAngle - Math.PI / 2;
            ctx.strokeStyle = rgba(p.fg, 0.85);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(ha) * (R - box * 0.7), cy + Math.sin(ha) * (R - box * 0.7));
            ctx.stroke();
            ctx.lineWidth = 1;
            ctx.fillStyle = rgba(p.fg, 0.85);
            ctx.beginPath();
            ctx.arc(cx, cy, 3, 0, TAU);
            ctx.fill();

            // Log + legend.
            const lx = narrow ? 18 : w * 0.62;
            const ly = narrow ? cy + R + box / 2 + 18 : cy - R;
            mono(ctx, 11, rgba(p.fg, 0.55));
            ctx.textBaseline = "top";
            const rate = hits + misses ? Math.round((hits / (hits + misses)) * 100) : 0;
            ctx.fillText(`hit rate ${rate}%`, lx, ly);
            log.slice(0, narrow ? 2 : 6).forEach((line, i) => {
                ctx.fillStyle = rgba(p.fg, i === 0 ? 0.9 : 0.5 - i * 0.07);
                ctx.fillText(line, lx, ly + 22 + i * 17);
            });
            if (!narrow) {
                const gy = ly + 22 + 6 * 17 + 12;
                ctx.fillStyle = rgba(p.a, 1);
                ctx.beginPath();
                ctx.arc(lx + 4, gy + 6, 2.5, 0, TAU);
                ctx.fill();
                ctx.fillStyle = rgba(p.fg, 0.5);
                ctx.fillText("ref", lx + 12, gy);
                ctx.fillStyle = rgba(p.c, 0.95);
                ctx.fillRect(lx + 46, gy + 2, 8, 8);
                ctx.fillStyle = rgba(p.fg, 0.5);
                ctx.fillText("dirty", lx + 58, gy);
                ctx.strokeStyle = rgba(p.fg, 0.9);
                ctx.lineWidth = 2;
                ctx.strokeRect(lx + 108, gy + 2, 8, 8);
                ctx.lineWidth = 1;
                ctx.fillText("pinned", lx + 122, gy);
            }
        },
    };
}
