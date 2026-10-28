import { mono, rand, rgba, ramp } from "./util.js";

// Browser Minecraft: a 2D slice of terrain, first drawn as one quad per block face,
// then merged into maximal rectangles the way the mesh worker does it.
const COLS = 18;
const ROWS = 10;

function terrain() {
    const o1 = rand(0, 100);
    const o2 = rand(0, 100);
    const grid = [];
    for (let r = 0; r < ROWS; r++) {
        grid.push([]);
        for (let c = 0; c < COLS; c++) {
            const h = Math.sin(c * 0.42 + o1) * 1.5 + Math.sin(c * 0.19 + o2) * 2.1 + 5.2;
            const surface = ROWS - Math.round(h);
            let type = 0;
            if (r === surface) type = 1;
            else if (r > surface && r <= surface + 2) type = 2;
            else if (r > surface + 2) type = 3;
            grid[r].push(type);
        }
    }
    return grid;
}

function greedyMerge(grid) {
    const seen = grid.map((row) => row.map(() => false));
    const rects = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const type = grid[r][c];
            if (!type || seen[r][c]) continue;
            let w = 1;
            while (c + w < COLS && grid[r][c + w] === type && !seen[r][c + w]) w++;
            let h = 1;
            grow: while (r + h < ROWS) {
                for (let x = c; x < c + w; x++) {
                    if (grid[r + h][x] !== type || seen[r + h][x]) break grow;
                }
                h++;
            }
            for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) seen[y][x] = true;
            rects.push({ r, c, w, h, type });
        }
    }
    return rects;
}

export default function greedy() {
    let grid, rects, faces, phase, t, shown;

    function reset() {
        grid = terrain();
        rects = greedyMerge(grid);
        faces = grid.flat().filter(Boolean).length;
        phase = 0;
        t = 0;
        shown = 0;
    }
    reset();

    const typeTone = [0, 0.95, 0.5, 0.08];

    return {
        step(dt) {
            t += dt;
            if (phase === 0 && t > 1.4) {
                phase = 1;
                t = 0;
            } else if (phase === 1) {
                shown = Math.min(rects.length, Math.floor(t / 0.11));
                if (shown === rects.length && t > rects.length * 0.11 + 0.3) {
                    phase = 2;
                    t = 0;
                }
            } else if (phase === 2 && t > 2.6) {
                reset();
            }
        },
        draw(ctx, w, h, p) {
            const pad = 16;
            const top = 34;
            const s = Math.floor(Math.min((w - pad * 2) / COLS, (h - top - pad) / ROWS));
            const ox = Math.round((w - s * COLS) / 2);
            const oy = Math.round(top + (h - top - pad - s * ROWS) / 2);

            // Grid scaffold.
            ctx.strokeStyle = rgba(p.fg, 0.06);
            ctx.lineWidth = 1;
            for (let c = 0; c <= COLS; c++) {
                ctx.beginPath();
                ctx.moveTo(ox + c * s + 0.5, oy);
                ctx.lineTo(ox + c * s + 0.5, oy + ROWS * s);
                ctx.stroke();
            }
            for (let r = 0; r <= ROWS; r++) {
                ctx.beginPath();
                ctx.moveTo(ox, oy + r * s + 0.5);
                ctx.lineTo(ox + COLS * s, oy + r * s + 0.5);
                ctx.stroke();
            }

            const merged = rects.slice(0, phase === 0 ? 0 : shown);
            const covered = new Set();
            for (const q of merged) for (let y = q.r; y < q.r + q.h; y++) for (let x = q.c; x < q.c + q.w; x++) covered.add(y * COLS + x);

            // Unmerged faces: one small quad each.
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    const type = grid[r][c];
                    if (!type || covered.has(r * COLS + c)) continue;
                    ctx.fillStyle = ramp(p, typeTone[type], 0.22);
                    ctx.strokeStyle = ramp(p, typeTone[type], 0.7);
                    ctx.fillRect(ox + c * s + 2, oy + r * s + 2, s - 4, s - 4);
                    ctx.strokeRect(ox + c * s + 2.5, oy + r * s + 2.5, s - 5, s - 5);
                }
            }

            // Merged quads.
            merged.forEach((q, i) => {
                const fresh = phase === 1 && i === shown - 1;
                ctx.fillStyle = ramp(p, typeTone[q.type], fresh ? 0.75 : 0.45);
                ctx.fillRect(ox + q.c * s + 1, oy + q.r * s + 1, q.w * s - 2, q.h * s - 2);
                ctx.strokeStyle = rgba(p.fg, fresh ? 0.9 : 0.35);
                ctx.lineWidth = fresh ? 1.5 : 1;
                ctx.strokeRect(ox + q.c * s + 1.5, oy + q.r * s + 1.5, q.w * s - 3, q.h * s - 3);
                ctx.lineWidth = 1;
            });

            // Sweep line while merging.
            if (phase === 1 && shown < rects.length) {
                const q = rects[shown] || rects[rects.length - 1];
                ctx.fillStyle = rgba(p.fg, 0.08);
                ctx.fillRect(ox, oy + q.r * s, COLS * s, s);
            }

            const quads = phase === 0 ? faces : faces - merged.reduce((n, q) => n + q.w * q.h, 0) + merged.length;
            mono(ctx, 11, rgba(p.fg, 0.55));
            ctx.textBaseline = "top";
            ctx.fillText(phase === 0 ? "naive: 1 quad / face" : phase === 1 ? "greedy merge…" : "merged", pad, 12);
            const label = `faces ${faces}  →  quads ${quads}`;
            ctx.fillStyle = rgba(p.fg, 0.85);
            ctx.fillText(label, w - pad - ctx.measureText(label).width, 12);
        },
    };
}
