import { TAU, clamp, mix, mono, rand, rgba } from "./util.js";

// Browser Minecraft: the chunk pipeline around a moving camera. Chunks inside the render
// distance are queued by priority (in view first, then nearest), generated on one worker pool,
// meshed on another, and uploaded on the main thread in idle time. The thread lanes on the right
// show the pools at work; chunks outside the view frustum are loaded but not drawn. Below them, a
// slice through one chunk shows face culling, with water displaced in the vertex shader.
const CS = 16;
const GEN = 6;
const MESH = 3;
const FOV = 1.3;
const SEA = 0.4;
const WINDOW = 3.2;
const SLICE_COLS = 22;
const SLICE_ROWS = 9;

// Small value-noise fBm for the terrain.
function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function height(x, z, seed) {
    let h = 0;
    let amp = 0.55;
    let f = 1 / 60;
    for (let o = 0; o < 4; o++) {
        h += noise(x * f + seed, z * f - seed) * amp;
        amp *= 0.5;
        f *= 2.1;
    }
    return clamp((h - 0.2) / 0.75, 0, 1);
}

// One cross-section of a chunk: 0 air, 1 grass, 2 dirt, 3 stone, 4 water.
function slice() {
    const o1 = rand(0, 100);
    const o2 = rand(0, 100);
    const sea = SLICE_ROWS - 4;
    const grid = [];
    for (let r = 0; r < SLICE_ROWS; r++) grid.push(new Array(SLICE_COLS).fill(0));
    for (let c = 0; c < SLICE_COLS; c++) {
        const h = Math.sin(c * 0.37 + o1) * 1.6 + Math.sin(c * 0.17 + o2) * 2.2 + 4.4;
        const surface = clamp(SLICE_ROWS - Math.round(h), 1, SLICE_ROWS - 1);
        for (let r = 0; r < SLICE_ROWS; r++) {
            if (r === surface) grid[r][c] = surface > sea ? 2 : 1;
            else if (r > surface) grid[r][c] = r > surface + 2 ? 3 : 2;
            else if (r >= sea) grid[r][c] = 4;
        }
    }
    return grid;
}

// Terrain is thousands of cells a frame, so its colours come from small per-palette tables.
let lut = null;
function tables(p) {
    const key = p.fg + p.a + p.b;
    if (lut?.key !== key) {
        const ramp = (h1, h2, t) => Array.from({ length: 49 }, (_, q) => mix(h1, h2, t, q / 48));
        lut = { key, water: ramp(p.b, p.b, 0), land: ramp(p.fg, p.fg, 0), peak: ramp(p.fg, p.a, 0.35) };
    }
    return lut;
}
const q48 = (a) => Math.round(clamp(a, 0, 1) * 48);

export default function chunks() {
    const seed = rand(0, 500);
    const cam = { x: 0, z: 0, heading: rand(0, TAU), look: 0 };
    let time = 0;
    let rd = 5;
    let rdT = 0;
    let rdFlash = 9;
    const map = new Map();
    const lanes = [];
    for (let i = 0; i < GEN; i++) lanes.push({ kind: "gen", label: `gen ${i}`, job: null });
    for (let i = 0; i < MESH; i++) lanes.push({ kind: "mesh", label: `mesh ${i}`, job: null });
    lanes.push({ kind: "main", label: "main", job: null });
    let bars = [];
    let stats = { visible: 0, ready: 0, queued: 0, cancelled: 0 };

    let grid = slice();
    let phase = 0;
    let phaseT = 0;
    let sweep = 0;

    const keyOf = (i, j) => `${i},${j}`;

    function makeChunk(i, j) {
        const hs = new Float32Array(64);
        for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) hs[b * 8 + a] = height(i * CS + a * 2 + 1, j * CS + b * 2 + 1, seed);
        return { i, j, key: keyOf(i, j), state: "queued", hs, job: null, readyT: 0, inView: false, dist: 0, land: null, landKey: null };
    }

    function inFrustum(c) {
        const r = (rd + 0.7) * CS;
        const pts = [
            [c.i * CS + 8, c.j * CS + 8],
            [c.i * CS, c.j * CS],
            [c.i * CS + CS, c.j * CS],
            [c.i * CS, c.j * CS + CS],
            [c.i * CS + CS, c.j * CS + CS],
        ];
        if (cam.x >= c.i * CS && cam.x < c.i * CS + CS && cam.z >= c.j * CS && cam.z < c.j * CS + CS) return true;
        const dir = cam.heading + cam.look;
        return pts.some(([x, z]) => {
            const dx = x - cam.x;
            const dz = z - cam.z;
            if (Math.hypot(dx, dz) > r) return false;
            const a = Math.atan2(dz, dx) - dir;
            return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < FOV / 2;
        });
    }

    function startJob(lane, c, dur) {
        lane.job = { key: c.key, t0: time, dur, bar: { lane: lanes.indexOf(lane), t0: time, t1: null, kind: lane.kind, label: c.key, cancelled: false } };
        bars.push(lane.job.bar);
        c.job = lane;
    }

    function cancel(c) {
        const lane = c.job;
        if (lane && lane.job && lane.job.key === c.key) {
            lane.job.bar.t1 = time;
            lane.job.bar.cancelled = true;
            lane.job = null;
            stats.cancelled++;
        }
        c.job = null;
    }

    function schedule(kind, want) {
        const free = lanes.filter((l) => l.kind === kind && !l.job);
        if (!free.length) return;
        const waiting = [...map.values()].filter((c) => c.state === want && !c.job);
        // Priority: chunks in view first, then nearest. Re-evaluated every frame while they wait.
        waiting.sort((a, b) => (b.inView - a.inView) * 1e6 + (a.dist - b.dist));
        free.forEach((lane, k) => {
            const c = waiting[k];
            if (!c) return;
            c.state = kind === "gen" ? "gen" : kind === "mesh" ? "mesh" : "upload";
            startJob(lane, c, kind === "gen" ? rand(0.35, 0.6) : kind === "mesh" ? rand(0.18, 0.32) : rand(0.035, 0.06));
        });
    }

    return {
        step(dt) {
            dt = Math.min(dt, 1 / 30);
            if (!dt) return;
            time += dt;

            // Wander: speed and heading drift, and the camera looks around a little.
            const speed = 9 + Math.sin(time * 0.31) * 4;
            cam.heading += (Math.sin(time * 0.23) * 0.35 + Math.sin(time * 0.071 + seed) * 0.25) * dt;
            cam.look = Math.sin(time * 0.6) * 0.35;
            cam.x += Math.cos(cam.heading) * speed * dt;
            cam.z += Math.sin(cam.heading) * speed * dt;

            // The render distance changes now and then, which cancels work in flight beyond it.
            rdT += dt;
            rdFlash += dt;
            if (rdT > (rd === 5 ? 14 : 4)) {
                rd = rd === 5 ? 4 : 5;
                rdT = 0;
                rdFlash = 0;
            }

            const ci = Math.floor(cam.x / CS);
            const cj = Math.floor(cam.z / CS);
            const reach = rd * CS;
            for (let j = cj - rd - 1; j <= cj + rd + 1; j++)
                for (let i = ci - rd - 1; i <= ci + rd + 1; i++) {
                    const d = Math.hypot(i * CS + 8 - cam.x, j * CS + 8 - cam.z);
                    if (d <= reach && !map.has(keyOf(i, j))) map.set(keyOf(i, j), makeChunk(i, j));
                }
            for (const c of map.values()) {
                c.dist = Math.hypot(c.i * CS + 8 - cam.x, c.j * CS + 8 - cam.z);
                if (c.dist > reach + 6) {
                    if (c.job) cancel(c);
                    map.delete(c.key);
                    continue;
                }
                c.inView = inFrustum(c);
            }

            // Finish jobs.
            for (const lane of lanes) {
                const job = lane.job;
                if (!job || time - job.t0 < job.dur) continue;
                job.bar.t1 = time;
                lane.job = null;
                const c = map.get(job.key);
                if (!c) continue;
                c.job = null;
                if (c.state === "gen") c.state = "generated";
                else if (c.state === "mesh") c.state = "meshed";
                else if (c.state === "upload") {
                    c.state = "ready";
                    c.readyT = time;
                }
            }
            schedule("gen", "queued");
            schedule("mesh", "generated");
            schedule("main", "meshed");
            bars = bars.filter((b) => b.t1 === null || time - b.t1 < WINDOW);

            stats.ready = 0;
            stats.visible = 0;
            stats.queued = 0;
            for (const c of map.values()) {
                if (c.state === "ready") {
                    stats.ready++;
                    if (c.inView) stats.visible++;
                } else if (c.state === "queued") stats.queued++;
            }

            // Face-culling slice: show every face, sweep away the hidden ones, hold, regenerate.
            phaseT += dt;
            if (phase === 0 && phaseT > 1.4) (phase = 1), (phaseT = 0);
            else if (phase === 1) {
                sweep = Math.min(SLICE_COLS, phaseT * 9);
                if (sweep >= SLICE_COLS && phaseT > SLICE_COLS / 9 + 0.2) (phase = 2), (phaseT = 0);
            } else if (phase === 2 && phaseT > 4) {
                grid = slice();
                phase = 0;
                phaseT = 0;
                sweep = 0;
            }
        },
        draw(ctx, w, h, p) {
            const top = 30;
            const wide = w > 560;
            const side = Math.min(h - top - 12, w * (wide ? 0.46 : 0.5));
            const M = { x: 12, y: top + (h - top - 12 - side) / 2, s: side };
            const rx = M.x + side + Math.max(18, w * 0.035);
            const rw = w - rx - 12;

            drawMap(ctx, M, p);

            if (wide) {
                const lanesH = Math.round((h - top) * 0.48);
                drawLanes(ctx, rx, top + 4, rw, lanesH, p, true);
                drawSlice(ctx, rx, top + lanesH + 26, rw, h - top - lanesH - 38, p);
            } else {
                drawLanes(ctx, rx, M.y, rw, side * 0.56, p, false);
                drawSlice(ctx, rx, M.y + side * 0.62, rw, side * 0.38, p, true);
            }

            // HUD.
            ctx.textBaseline = "top";
            mono(ctx, 11, rdFlash < 1.2 ? rgba(p.c, 0.95) : rgba(p.fg, 0.55));
            const left = `render distance ${rd}`;
            ctx.fillText(left, 14, 8);
            mono(ctx, 11, rgba(p.fg, 0.4));
            const tail = ` · ${stats.ready} chunks · ${stats.queued} queued`;
            if (wide || w > 400) ctx.fillText(tail, 14 + ctx.measureText(left).width, 8);
            if (w > 520) {
                ctx.textAlign = "right";
                mono(ctx, 11, rgba(p.fg, 0.45));
                ctx.fillText(`draw calls ${stats.visible} · frustum culled ${stats.ready - stats.visible}`, w - 14, 8);
                ctx.textAlign = "left";
            }
        },
    };

    function bakeLand(c, T) {
        c.landKey = T.key;
        if (typeof document === "undefined") return;
        c.land ??= Object.assign(document.createElement("canvas"), { width: 8, height: 8 });
        const g = c.land.getContext("2d");
        g.clearRect(0, 0, 8, 8);
        for (let i = 0; i < 64; i++) {
            const hgt = c.hs[i];
            if (hgt < SEA) continue;
            g.fillStyle = hgt > 0.72 ? T.peak[q48(0.2 + hgt * 0.4)] : T.land[q48(0.07 + (hgt - SEA) * 0.55)];
            g.fillRect(i % 8, Math.floor(i / 8), 1, 1);
        }
    }

    function drawMap(ctx, M, p) {
        const view = (5 + 1) * 2 * CS;
        const bs = M.s / view;
        const cx = M.x + M.s / 2;
        const cy = M.y + M.s / 2;
        const X = (x) => cx + (x - cam.x) * bs;
        const Y = (z) => cy + (z - cam.z) * bs;

        ctx.save();
        ctx.beginPath();
        ctx.rect(M.x, M.y, M.s, M.s);
        ctx.clip();
        ctx.fillStyle = rgba(p.fg, 0.02);
        ctx.fillRect(M.x, M.y, M.s, M.s);

        const cell = (CS / 8) * bs;
        const T = tables(p);
        for (const c of map.values()) {
            const x0 = X(c.i * CS);
            const y0 = Y(c.j * CS);
            const sz = CS * bs;
            if (x0 > M.x + M.s || y0 > M.y + M.s || x0 + sz < M.x || y0 + sz < M.y) continue;
            if (c.state === "ready") {
                const fade = clamp((time - c.readyT) / 0.35, 0, 1);
                const k = (c.inView ? 1 : 0.32) * fade;
                // Land doesn't change, so it's baked once into an 8 × 8 image; only water is redrawn.
                if (c.landKey !== T.key) bakeLand(c, T);
                if (c.land) {
                    ctx.globalAlpha = k;
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(c.land, x0, y0, sz, sz);
                    ctx.globalAlpha = 1;
                }
                for (let b = 0; b < 8; b++)
                    for (let a = 0; a < 8; a++) {
                        const hgt = c.hs[b * 8 + a];
                        if (hgt >= SEA) continue;
                        // The water "shader": a moving ripple over depth.
                        const wx = c.i * CS + a * 2;
                        const wz = c.j * CS + b * 2;
                        const ripple = 0.5 + 0.5 * Math.sin(wx * 0.35 + time * 2.1) * Math.sin(wz * 0.29 - time * 1.6);
                        ctx.fillStyle = T.water[q48((0.14 + (SEA - hgt) * 0.5 + ripple * 0.16) * k)];
                        ctx.fillRect(x0 + a * cell, y0 + b * cell, cell + 0.4, cell + 0.4);
                    }
                ctx.strokeStyle = rgba(p.fg, c.inView ? 0.1 : 0.04);
                ctx.strokeRect(x0 + 0.5, y0 + 0.5, sz - 1, sz - 1);
            } else {
                const lane = c.job;
                const job = lane && lane.job && lane.job.key === c.key ? lane.job : null;
                const prog = job ? clamp((time - job.t0) / job.dur, 0, 1) : 0;
                const col = c.state === "gen" || c.state === "generated" ? p.a : c.state === "queued" ? p.fg : p.c;
                if (c.state === "queued") {
                    ctx.fillStyle = rgba(p.fg, c.inView ? 0.35 : 0.18);
                    ctx.fillRect(x0 + sz / 2 - 1, y0 + sz / 2 - 1, 2, 2);
                    continue;
                }
                if (job) {
                    ctx.fillStyle = rgba(col, 0.18);
                    ctx.fillRect(x0 + 1, y0 + 1 + (sz - 2) * (1 - prog), sz - 2, (sz - 2) * prog);
                }
                ctx.strokeStyle = rgba(col, job ? 0.9 : 0.35);
                ctx.strokeRect(x0 + 1.5, y0 + 1.5, sz - 3, sz - 3);
            }
        }

        // Render distance and the view frustum.
        ctx.strokeStyle = rgba(p.fg, 0.25);
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(cx, cy, rd * CS * bs, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        const dir = cam.heading + cam.look;
        const fr = (rd + 0.7) * CS * bs;
        ctx.fillStyle = rgba(p.fg, 0.05);
        ctx.strokeStyle = rgba(p.fg, 0.5);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, fr, dir - FOV / 2, dir + FOV / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = rgba(p.fg, 0.95);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(dir) * 7, cy + Math.sin(dir) * 7);
        ctx.lineTo(cx + Math.cos(dir + 2.5) * 5, cy + Math.sin(dir + 2.5) * 5);
        ctx.lineTo(cx + Math.cos(dir - 2.5) * 5, cy + Math.sin(dir - 2.5) * 5);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = rgba(p.fg, 0.35);
        ctx.strokeRect(Math.round(M.x) + 0.5, Math.round(M.y) + 0.5, Math.round(M.s) - 1, Math.round(M.s) - 1);
    }

    function drawLanes(ctx, x, y, w, h, p, labels) {
        const labelW = labels ? 54 : 34;
        const gap = 6;
        const n = lanes.length;
        const lh = Math.min(18, (h - gap * 2 - 14) / n);
        const total = lh * n + gap * 2;
        const y0 = y + 16 + Math.max(0, (h - 16 - total) / 2);
        const tx = x + labelW;
        const tw = w - labelW;
        const pps = tw / WINDOW;
        const colOf = (kind) => (kind === "gen" ? p.a : kind === "mesh" ? p.c : p.fg);
        const laneY = (k) => y0 + k * lh + (k >= GEN ? gap : 0) + (k >= GEN + MESH ? gap : 0);

        ctx.textBaseline = "top";
        mono(ctx, 11, rgba(p.fg, 0.55));
        ctx.fillText(labels ? "worker threads" : "workers", x, y);
        if (labels && w > 300) {
            ctx.textAlign = "right";
            mono(ctx, 11, rgba(p.fg, 0.35));
            ctx.fillText(`last ${WINDOW.toFixed(0)} s · ${stats.cancelled} cancelled`, x + w, y);
            ctx.textAlign = "left";
        }

        lanes.forEach((lane, k) => {
            const ly = laneY(k);
            if (labels) {
                mono(ctx, 10, rgba(colOf(lane.kind), lane.job ? 0.9 : 0.4));
                ctx.textBaseline = "middle";
                ctx.fillText(lane.label, x, ly + lh / 2);
            }
            ctx.fillStyle = rgba(p.fg, 0.03);
            ctx.fillRect(tx, ly + 1, tw, lh - 2);
        });
        if (!labels) {
            // Too small to name each lane: one label per pool.
            ctx.textBaseline = "middle";
            for (const [kind, from, count] of [
                ["gen", 0, GEN],
                ["mesh", GEN, MESH],
                ["main", GEN + MESH, 1],
            ]) {
                mono(ctx, 9, rgba(colOf(kind), 0.8));
                ctx.fillText(kind, x, laneY(from) + (count * lh) / 2);
            }
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(tx, y0 - 2, tw, total + 4);
        ctx.clip();
        for (const b of bars) {
            const ly = laneY(b.lane);
            const t1 = b.t1 ?? time;
            const bx = tx + tw - (time - b.t0) * pps;
            const bw = Math.max(1.5, (t1 - b.t0) * pps);
            const col = colOf(b.kind);
            const inset = b.kind === "main" ? lh * 0.3 : 2;
            if (b.cancelled) {
                ctx.strokeStyle = rgba(p.d, 0.7);
                ctx.setLineDash([2, 2]);
                ctx.strokeRect(bx + 0.5, ly + inset + 0.5, bw - 1, lh - inset * 2 - 1);
                ctx.setLineDash([]);
                mono(ctx, 9, rgba(p.d, 0.9));
                ctx.textBaseline = "middle";
                ctx.fillText("×", bx + bw + 2, ly + lh / 2);
                continue;
            }
            ctx.fillStyle = rgba(col, b.t1 === null ? 0.5 : 0.28);
            ctx.fillRect(bx, ly + inset, bw - 1, lh - inset * 2);
            if (b.t1 === null) {
                ctx.fillStyle = rgba(col, 1);
                ctx.fillRect(bx + bw - 2, ly + inset, 2, lh - inset * 2);
            }
            if (labels && bw > 40 && b.kind !== "main") {
                mono(ctx, 9, rgba(p.fg, 0.6));
                ctx.textBaseline = "middle";
                ctx.fillText(b.label, bx + 4, ly + lh / 2 + 0.5);
            }
        }
        ctx.restore();
    }

    function drawSlice(ctx, x, y, w, h, p, compact = false) {
        const s = Math.floor(Math.min(w / SLICE_COLS, (h - 18) / SLICE_ROWS));
        if (s < 5) return;
        const ox = Math.round(x + (w - s * SLICE_COLS) / 2);
        const oy = Math.round(y + 18);
        const at = (r, c) => (r < 0 ? 0 : r >= SLICE_ROWS || c < 0 || c >= SLICE_COLS ? 3 : grid[r][c]);
        const tone = [0, 0.95, 0.55, 0.15];
        let total = 0;
        let kept = 0;

        // Water surface heights from the "vertex shader": a few travelling sines.
        const wave = (c) => (Math.sin(c * 0.9 + time * 2.2) * 0.12 + Math.sin(c * 2.3 - time * 1.4) * 0.06) * s;

        for (let r = 0; r < SLICE_ROWS; r++)
            for (let c = 0; c < SLICE_COLS; c++) {
                const t = grid[r][c];
                if (!t) continue;
                const cx = ox + c * s;
                const cy = oy + r * s;
                if (t === 4) {
                    const lift = at(r - 1, c) === 0 ? wave(c) : 0;
                    ctx.fillStyle = rgba(p.b, 0.16);
                    ctx.fillRect(cx, cy - lift, s, s + lift);
                } else {
                    ctx.fillStyle = mix(p.fg, p.a, tone[t] * 0.6, 0.07 + tone[t] * 0.06);
                    ctx.fillRect(cx, cy, s, s);
                }
            }

        // Faces. A face is kept only where its neighbour is see-through: air, or water for solid blocks.
        const culled = (c) => phase === 2 || (phase === 1 && c + 0.5 < sweep);
        ctx.lineCap = "butt";
        for (let r = 0; r < SLICE_ROWS; r++)
            for (let c = 0; c < SLICE_COLS; c++) {
                const t = grid[r][c];
                if (!t) continue;
                const cx = ox + c * s;
                const cy = oy + r * s;
                for (const [dr, dc] of [
                    [-1, 0],
                    [1, 0],
                    [0, -1],
                    [0, 1],
                ]) {
                    const n = at(r + dr, c + dc);
                    const visible = t === 4 ? n === 0 : n === 0 || n === 4;
                    total++;
                    if (visible) kept++;
                    const gone = !visible && culled(c);
                    const inset = Math.min(2.5, s * 0.18);
                    let x1, y1, x2, y2;
                    if (dr === -1) [x1, y1, x2, y2] = [cx + inset, cy + 1, cx + s - inset, cy + 1];
                    else if (dr === 1) [x1, y1, x2, y2] = [cx + inset, cy + s - 1, cx + s - inset, cy + s - 1];
                    else if (dc === -1) [x1, y1, x2, y2] = [cx + 1, cy + inset, cx + 1, cy + s - inset];
                    else [x1, y1, x2, y2] = [cx + s - 1, cy + inset, cx + s - 1, cy + s - inset];
                    if (t === 4 && dr === -1 && visible) continue;
                    if (gone) {
                        ctx.strokeStyle = rgba(p.fg, 0.07);
                        ctx.lineWidth = 1;
                    } else if (visible && culled(c)) {
                        ctx.strokeStyle = t === 4 ? rgba(p.b, 0.8) : rgba(p.c, 0.9);
                        ctx.lineWidth = 2;
                    } else {
                        ctx.strokeStyle = rgba(p.fg, t === 4 ? 0.25 : 0.45);
                        ctx.lineWidth = 1;
                    }
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
            }

        // The water's top faces, displaced.
        ctx.strokeStyle = rgba(p.b, 0.95);
        ctx.lineWidth = 2;
        let firstWater = null;
        for (let c = 0; c < SLICE_COLS; c++) {
            for (let r = 0; r < SLICE_ROWS; r++) {
                if (grid[r][c] !== 4 || at(r - 1, c) !== 0) continue;
                if (firstWater === null) firstWater = [c, r];
                const yl = oy + r * s - wave(c) + 1;
                const yr = oy + r * s - wave(c + 1) + 1;
                ctx.beginPath();
                ctx.moveTo(ox + c * s, yl);
                ctx.lineTo(ox + c * s + s, yr);
                ctx.stroke();
            }
        }
        ctx.lineWidth = 1;

        const shown = phase === 0 ? total : phase === 2 ? kept : total - countCulledBefore(sweep);
        ctx.textBaseline = "top";
        mono(ctx, 11, rgba(p.fg, 0.55));
        if (!compact) ctx.fillText(phase === 0 ? "every face" : phase === 1 ? "culling hidden faces…" : "face culling", ox, y);
        const label = compact ? `faces ${total}→${shown}` : `faces ${total} → ${shown}`;
        mono(ctx, 11, rgba(p.fg, 0.85));
        ctx.fillText(label, ox + s * SLICE_COLS - ctx.measureText(label).width, y);
        if (firstWater && phase === 2 && !compact) {
            mono(ctx, 10, rgba(p.b, 0.85));
            ctx.textBaseline = "bottom";
            ctx.fillText("vertex shader", ox + firstWater[0] * s + 2, oy + firstWater[1] * s - s * 0.25);
        }

        function countCulledBefore(limit) {
            let n = 0;
            for (let r = 0; r < SLICE_ROWS; r++)
                for (let c = 0; c < SLICE_COLS && c + 0.5 < limit; c++) {
                    const t = grid[r][c];
                    if (!t) continue;
                    for (const [dr, dc] of [
                        [-1, 0],
                        [1, 0],
                        [0, -1],
                        [0, 1],
                    ]) {
                        const nb = at(r + dr, c + dc);
                        if (!(t === 4 ? nb === 0 : nb === 0 || nb === 4)) n++;
                    }
                }
            return n;
        }
    }
}
