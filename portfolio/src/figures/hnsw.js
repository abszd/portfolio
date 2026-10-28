import { TAU, mono, rand, rgba, ramp } from "./util.js";

// AriDB: a three-layer HNSW graph. Levels are drawn with the same exponential
// decay the index uses, and a query walks greedily down through the layers.
const N = 64;
const LAYERS = 3;
const LINKS = [3, 2, 2];

function build() {
    const mL = 1 / Math.log(4);
    const nodes = [];
    for (let i = 0; i < N; i++) {
        const level = Math.min(LAYERS - 1, Math.floor(-Math.log(1 - Math.random()) * mL));
        nodes.push({ x: rand(0.04, 0.96), y: rand(0.08, 0.92), level });
    }
    if (!nodes.some((n) => n.level === LAYERS - 1)) nodes[0].level = LAYERS - 1;
    if (nodes.filter((n) => n.level >= 1).length < 4) for (let i = 1; i < 6; i++) nodes[i].level = Math.max(1, nodes[i].level);

    const adj = [];
    for (let L = 0; L < LAYERS; L++) {
        const ids = nodes.map((n, i) => i).filter((i) => nodes[i].level >= L);
        const links = new Map(ids.map((i) => [i, new Set()]));
        for (const i of ids) {
            const near = ids
                .filter((j) => j !== i)
                .sort((a, b) => dist(nodes[i], nodes[a]) - dist(nodes[i], nodes[b]))
                .slice(0, LINKS[L]);
            for (const j of near) {
                links.get(i).add(j);
                links.get(j).add(i);
            }
        }
        adj.push(links);
    }
    const entry = nodes.findIndex((n) => n.level === LAYERS - 1);
    return { nodes, adj, entry };
}

function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

// Greedy descent: returns a list of moves {from, to, layer} plus "drop" moves between layers.
function search(g, q) {
    const path = [];
    let cur = g.entry;
    for (let L = LAYERS - 1; L >= 0; L--) {
        for (;;) {
            let best = cur;
            for (const j of g.adj[L].get(cur)) if (dist(g.nodes[j], q) < dist(g.nodes[best], q)) best = j;
            if (best === cur) break;
            path.push({ from: cur, to: best, layer: L });
            cur = best;
        }
        if (L > 0) path.push({ from: cur, to: cur, layer: L, drop: true });
    }
    return { path, found: cur };
}

export default function hnsw() {
    let g = build();
    let q, run, t, queries = 0;

    function newQuery() {
        q = { x: rand(0.1, 0.9), y: rand(0.15, 0.85) };
        run = search(g, q);
        t = 0;
        queries++;
        if (queries % 4 === 0) {
            g = build();
            run = search(g, q);
        }
    }
    newQuery();

    const STEP = 0.42;

    return {
        step(dt) {
            t += dt;
            if (t > run.path.length * STEP + 2.2) newQuery();
        },
        draw(ctx, w, h, p) {
            const padX = 18;
            const top = 30;
            const layerGap = (h - top - 14) / LAYERS;
            const planeH = layerGap * 0.66;
            const skew = Math.min(70, w * 0.12);
            const planeW = w - padX * 2 - skew;

            const project = (n, L) => {
                const row = LAYERS - 1 - L;
                const y0 = top + row * layerGap + (layerGap - planeH) / 2;
                return [padX + n.x * planeW + (1 - n.y) * skew, y0 + n.y * planeH];
            };

            const done = Math.min(run.path.length, Math.floor(t / STEP));
            const partial = Math.min(1, (t - done * STEP) / STEP);
            const visited = new Set([g.entry]);
            for (let i = 0; i < done; i++) visited.add(run.path[i].to);
            const activeLayer = done < run.path.length ? run.path[done].layer : 0;

            for (let L = LAYERS - 1; L >= 0; L--) {
                // Plane.
                const corners = [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 1, y: 1 },
                    { x: 0, y: 1 },
                ].map((c) => project(c, L));
                ctx.beginPath();
                corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
                ctx.closePath();
                ctx.fillStyle = rgba(p.fg, L === activeLayer ? 0.05 : 0.025);
                ctx.fill();
                ctx.strokeStyle = rgba(p.fg, L === activeLayer ? 0.28 : 0.12);
                ctx.stroke();

                mono(ctx, 10, rgba(p.fg, 0.5));
                ctx.textBaseline = "bottom";
                const count = g.adj[L].size;
                ctx.fillText(`L${L} · ${count} nodes`, corners[0][0] + 6, corners[0][1] - 4);

                // Edges.
                ctx.strokeStyle = rgba(p.fg, 0.14);
                ctx.lineWidth = 1;
                for (const [i, set] of g.adj[L]) {
                    for (const j of set) {
                        if (j < i) continue;
                        const [x1, y1] = project(g.nodes[i], L);
                        const [x2, y2] = project(g.nodes[j], L);
                        ctx.beginPath();
                        ctx.moveTo(x1, y1);
                        ctx.lineTo(x2, y2);
                        ctx.stroke();
                    }
                }
                // Nodes.
                for (const i of g.adj[L].keys()) {
                    const [x, y] = project(g.nodes[i], L);
                    const on = visited.has(i);
                    ctx.fillStyle = on ? ramp(p, 1 - L / (LAYERS - 1), 1) : rgba(p.fg, 0.45);
                    ctx.beginPath();
                    ctx.arc(x, y, on ? 3.2 : 2, 0, TAU);
                    ctx.fill();
                }
                // Query marker on each plane.
                const [qx, qy] = project(q, L);
                ctx.strokeStyle = rgba(p.c, L === activeLayer ? 0.95 : 0.35);
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(qx - 6, qy);
                ctx.lineTo(qx + 6, qy);
                ctx.moveTo(qx, qy - 6);
                ctx.lineTo(qx, qy + 6);
                ctx.stroke();
                ctx.lineWidth = 1;
            }

            // Search path.
            ctx.lineWidth = 2;
            for (let i = 0; i < Math.min(run.path.length, done + 1); i++) {
                const m = run.path[i];
                const k = i < done ? 1 : partial;
                const [x1, y1] = project(g.nodes[m.from], m.layer);
                const [x2, y2] = m.drop ? project(g.nodes[m.to], m.layer - 1) : project(g.nodes[m.to], m.layer);
                ctx.strokeStyle = m.drop ? rgba(p.fg, 0.55) : ramp(p, 1 - m.layer / (LAYERS - 1), 0.95);
                ctx.setLineDash(m.drop ? [3, 4] : []);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k);
                ctx.stroke();
            }
            ctx.setLineDash([]);
            ctx.lineWidth = 1;

            // Result ring.
            if (done >= run.path.length) {
                const [x, y] = project(g.nodes[run.found], 0);
                const pulse = (t - run.path.length * STEP) * 1.4;
                ctx.strokeStyle = rgba(p.c, Math.max(0, 1 - pulse * 0.5));
                ctx.beginPath();
                ctx.arc(x, y, 5 + pulse * 10, 0, TAU);
                ctx.stroke();
            }

            mono(ctx, 11, rgba(p.fg, 0.55));
            ctx.textBaseline = "top";
            ctx.fillText(`query #${queries}`, padX, 10);
            const hops = run.path.filter((m) => !m.drop).length;
            const label = done >= run.path.length ? `nearest found · ${hops} hops` : `searching L${activeLayer}…`;
            ctx.fillStyle = rgba(p.fg, 0.85);
            ctx.fillText(label, w - padX - ctx.measureText(label).width, 10);
        },
    };
}
