import { MaxHeap, hexToRgb, mono, randInt, rgba } from "./util.js";

// Locked-In: a generated floor plan goes through the same steps as the real pipeline:
// distance transform → peak markers → seeded watershed flood → room contours.
const CELL = 5;

function floorPlan(gw, gh) {
    const wall = new Uint8Array(gw * gh);
    const m = 3;
    const set = (x, y) => (wall[y * gw + x] = 1);
    for (let x = m; x < gw - m; x++) {
        set(x, m);
        set(x, gh - m - 1);
    }
    for (let y = m; y < gh - m; y++) {
        set(m, y);
        set(gw - m - 1, y);
    }
    // Outside the building counts as wall, like the cropped-away margin.
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (x < m || y < m || x >= gw - m || y >= gh - m) set(x, y);

    // Recursive split into rooms, each internal wall gets a door gap.
    const split = (x0, y0, x1, y1, depth) => {
        const w = x1 - x0;
        const h = y1 - y0;
        const minRoom = 11;
        if (depth > 4 || (w < minRoom * 2 && h < minRoom * 2)) return;
        if (depth > 1 && Math.random() < 0.2) return;
        const vertical = w > h ? true : h > w ? false : Math.random() < 0.5;
        if (vertical && w >= minRoom * 2) {
            const sx = randInt(x0 + minRoom, x1 - minRoom);
            const door = randInt(y0 + 2, y1 - 6);
            for (let y = y0; y < y1; y++) if (y < door || y > door + 3) set(sx, y);
            split(x0, y0, sx, y1, depth + 1);
            split(sx + 1, y0, x1, y1, depth + 1);
        } else if (!vertical && h >= minRoom * 2) {
            const sy = randInt(y0 + minRoom, y1 - minRoom);
            const door = randInt(x0 + 2, x1 - 6);
            for (let x = x0; x < x1; x++) if (x < door || x > door + 3) set(x, sy);
            split(x0, y0, x1, sy, depth + 1);
            split(x0, sy + 1, x1, y1, depth + 1);
        }
    };
    split(m + 1, m + 1, gw - m - 1, gh - m - 1, 0);
    return wall;
}

// Two-pass 3-4 chamfer distance transform (a cheap Euclidean approximation).
function distanceTransform(wall, gw, gh) {
    const d = new Float32Array(gw * gh);
    for (let i = 0; i < d.length; i++) d[i] = wall[i] ? 0 : 1e9;
    const fwd = [
        [-1, -1, 4],
        [0, -1, 3],
        [1, -1, 4],
        [-1, 0, 3],
    ];
    for (let y = 0; y < gh; y++)
        for (let x = 0; x < gw; x++) {
            const i = y * gw + x;
            for (const [dx, dy, c] of fwd) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < gw) d[i] = Math.min(d[i], d[ny * gw + nx] + c);
            }
        }
    for (let y = gh - 1; y >= 0; y--)
        for (let x = gw - 1; x >= 0; x--) {
            const i = y * gw + x;
            for (const [dx, dy, c] of fwd) {
                const nx = x - dx;
                const ny = y - dy;
                if (nx >= 0 && ny < gh && nx < gw) d[i] = Math.min(d[i], d[ny * gw + nx] + c);
            }
        }
    for (let i = 0; i < d.length; i++) d[i] /= 3;
    return d;
}

// Markers: cells that are the maximum of a wide window and far enough from any wall,
// grouped into connected components (one label per component).
function markers(d, gw, gh) {
    const R = 6;
    const label = new Int32Array(gw * gh);
    const isPeak = new Uint8Array(gw * gh);
    for (let y = 0; y < gh; y++)
        for (let x = 0; x < gw; x++) {
            const v = d[y * gw + x];
            if (v < 3) continue;
            let max = true;
            for (let dy = -R; dy <= R && max; dy++)
                for (let dx = -R; dx <= R; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
                    if (d[ny * gw + nx] > v + 1e-3) {
                        max = false;
                        break;
                    }
                }
            if (max) isPeak[y * gw + x] = 1;
        }
    let n = 0;
    for (let i = 0; i < isPeak.length; i++) {
        if (!isPeak[i] || label[i]) continue;
        n++;
        const stack = [i];
        label[i] = n;
        while (stack.length) {
            const j = stack.pop();
            const x = j % gw;
            const y = (j / gw) | 0;
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
                    const k = ny * gw + nx;
                    if (isPeak[k] && !label[k]) {
                        label[k] = n;
                        stack.push(k);
                    }
                }
        }
    }
    return { label, count: n };
}

export default function watershed() {
    let gw = 0;
    let gh = 0;
    let wall, dist, maxD, label, rooms, heap, phase, t, img, buf, perFrame;

    function reset(w, h) {
        gw = Math.max(40, Math.floor(w / CELL));
        gh = Math.max(24, Math.floor(h / CELL));
        wall = floorPlan(gw, gh);
        dist = distanceTransform(wall, gw, gh);
        maxD = dist.reduce((a, b) => Math.max(a, b), 0);
        const mk = markers(dist, gw, gh);
        label = mk.label;
        rooms = mk.count;
        heap = new MaxHeap();
        for (let i = 0; i < label.length; i++) if (label[i]) heap.push({ i, priority: dist[i] });
        perFrame = Math.ceil((gw * gh) / 110);
        phase = 0;
        t = 0;
        img = null;
    }

    function flood(n) {
        for (let k = 0; k < n && heap.size; k++) {
            const { i } = heap.pop();
            const x = i % gw;
            const y = (i / gw) | 0;
            const nb = [i - 1, i + 1, i - gw, i + gw];
            const ok = [x > 0, x < gw - 1, y > 0, y < gh - 1];
            for (let q = 0; q < 4; q++) {
                const j = nb[q];
                if (!ok[q] || wall[j] || label[j]) continue;
                label[j] = label[i];
                heap.push({ i: j, priority: dist[j] });
            }
        }
    }

    return {
        step(dt, w, h) {
            if (Math.floor(w / CELL) !== gw || Math.floor(h / CELL) !== gh) reset(w, h);
            t += dt;
            if (phase === 0 && t > 0.7) (phase = 1), (t = 0);
            else if (phase === 1 && t > 1.3) (phase = 2), (t = 0);
            else if (phase === 2 && t > 0.7) (phase = 3), (t = 0);
            else if (phase === 3) {
                flood(Math.ceil(perFrame * dt * 60));
                if (!heap.size) (phase = 4), (t = 0);
            } else if (phase === 4 && t > 2.8) reset(w, h);
        },
        draw(ctx, w, h, p) {
            if (!gw) return;
            if (!img || img.width !== gw || img.height !== gh) {
                buf = document.createElement("canvas");
                buf.width = gw;
                buf.height = gh;
                img = buf.getContext("2d").createImageData(gw, gh);
            }
            const fg = hexToRgb(p.fg);
            const bg = hexToRgb(p.bg);
            const accents = [hexToRgb(p.a), hexToRgb(p.b), hexToRgb(p.c)];
            const data = img.data;
            const heat = phase === 1 ? Math.min(1, t / 1.0) : phase >= 2 ? 1 : 0;
            const showLabels = phase >= 2;

            for (let i = 0; i < gw * gh; i++) {
                const o = i * 4;
                let c = bg;
                let a = 0;
                if (wall[i]) {
                    const x = i % gw;
                    const y = (i / gw) | 0;
                    const outside = x < 3 || y < 3 || x >= gw - 3 || y >= gh - 3;
                    if (!outside) (c = fg), (a = 0.85);
                } else if (showLabels && label[i]) {
                    const l = label[i];
                    const base = accents[l % 3];
                    const peak = phase === 2 || dist[i] >= maxD * 0.999;
                    c = base;
                    a = phase === 2 ? 0.95 : 0.22 + 0.25 * ((l * 0.37) % 1);
                    if (peak && phase === 2) a = 1;
                } else if (heat > 0) {
                    c = fg;
                    a = (dist[i] / maxD) * 0.35 * heat;
                }
                data[o] = c[0];
                data[o + 1] = c[1];
                data[o + 2] = c[2];
                data[o + 3] = a * 255;
            }

            // Room boundaries once flooding finishes.
            if (phase === 4) {
                for (let y = 1; y < gh - 1; y++)
                    for (let x = 1; x < gw - 1; x++) {
                        const i = y * gw + x;
                        if (!label[i]) continue;
                        if (label[i - 1] !== label[i] || label[i + 1] !== label[i] || label[i - gw] !== label[i] || label[i + gw] !== label[i]) {
                            const o = i * 4;
                            const c = accents[label[i] % 3];
                            data[o] = c[0];
                            data[o + 1] = c[1];
                            data[o + 2] = c[2];
                            data[o + 3] = 255;
                        }
                    }
            }

            buf.getContext("2d").putImageData(img, 0, 0);
            ctx.imageSmoothingEnabled = false;
            const ox = Math.floor((w - gw * CELL) / 2);
            const oy = Math.floor((h - gh * CELL) / 2);
            ctx.drawImage(buf, ox, oy, gw * CELL, gh * CELL);

            const steps = ["floor plan", "distance transform", "peak markers", "watershed flood", "rooms → GeoJSON"];
            mono(ctx, 11, rgba(p.fg, 0.7));
            ctx.textBaseline = "top";
            ctx.fillStyle = rgba(p.bg, 0.75);
            const label1 = `${phase}/4  ${steps[phase]}`;
            const label2 = phase >= 2 ? `rooms ${rooms}` : "";
            ctx.fillRect(ox + 18, oy + 18, ctx.measureText(label1).width + 12, 20);
            ctx.fillStyle = rgba(p.fg, 0.85);
            ctx.fillText(label1, ox + 24, oy + 22);
            if (label2) {
                const lw = ctx.measureText(label2).width;
                ctx.fillStyle = rgba(p.bg, 0.75);
                ctx.fillRect(ox + gw * CELL - lw - 30, oy + 18, lw + 12, 20);
                ctx.fillStyle = rgba(p.fg, 0.85);
                ctx.fillText(label2, ox + gw * CELL - lw - 24, oy + 22);
            }
        },
    };
}
