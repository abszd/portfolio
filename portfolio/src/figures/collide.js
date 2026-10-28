import { TAU, clamp, mono, rand, rgba, ramp } from "./util.js";

// HotStreak: top-down view of the player's sphere collider. It accelerates with
// momentum, casts ahead along its velocity, and slides along whatever it hits.
function arena(w, h) {
    const boxes = [];
    let tries = 0;
    while (boxes.length < 7 && tries++ < 200) {
        const bw = rand(30, 90);
        const bh = rand(20, 70);
        const b = { x: rand(30, w - bw - 30), y: rand(40, h - bh - 30), w: bw, h: bh };
        if (boxes.every((o) => b.x > o.x + o.w + 34 || b.x + b.w + 34 < o.x || b.y > o.y + o.h + 34 || b.y + b.h + 34 < o.y)) boxes.push(b);
    }
    return boxes;
}

// Ray vs. box expanded by the collider radius (a Minkowski sum), slab method.
function raycast(ox, oy, dx, dy, b, r) {
    const minX = b.x - r;
    const maxX = b.x + b.w + r;
    const minY = b.y - r;
    const maxY = b.y + b.h + r;
    let tmin = -Infinity;
    let tmax = Infinity;
    let nx = 0;
    let ny = 0;
    if (Math.abs(dx) < 1e-9) {
        if (ox < minX || ox > maxX) return null;
    } else {
        const t1 = (minX - ox) / dx;
        const t2 = (maxX - ox) / dx;
        const lo = Math.min(t1, t2);
        if (lo > tmin) (tmin = lo), (nx = dx > 0 ? -1 : 1), (ny = 0);
        tmax = Math.min(tmax, Math.max(t1, t2));
    }
    if (Math.abs(dy) < 1e-9) {
        if (oy < minY || oy > maxY) return null;
    } else {
        const t1 = (minY - oy) / dy;
        const t2 = (maxY - oy) / dy;
        const lo = Math.min(t1, t2);
        if (lo > tmin) (tmin = lo), (nx = 0), (ny = dy > 0 ? -1 : 1);
        tmax = Math.min(tmax, Math.max(t1, t2));
    }
    if (tmax < tmin || tmin < 0) return null;
    return { t: tmin, nx, ny };
}

export default function collide() {
    let W = 0;
    let H = 0;
    let boxes = [];
    const R = 9;
    const pl = { x: 40, y: 40, vx: 0, vy: 0 };
    let goal = { x: 0, y: 0 };
    let trail = [];
    let fuel = 1;
    let jet = false;
    let hits = 0;
    let lastHit = null;

    function inside(x, y, pad) {
        return boxes.some((b) => x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad);
    }

    function pickGoal() {
        do goal = { x: rand(30, W - 30), y: rand(40, H - 30) };
        while (inside(goal.x, goal.y, R + 6));
    }

    function reset(w, h) {
        W = w;
        H = h;
        boxes = arena(w, h);
        do (pl.x = rand(20, w - 20)), (pl.y = rand(40, h - 20));
        while (inside(pl.x, pl.y, R + 2));
        pl.vx = pl.vy = 0;
        trail = [];
        pickGoal();
    }

    return {
        step(dt, w, h) {
            if (w !== W || h !== H) reset(w, h);
            dt = Math.min(dt, 1 / 30);
            const gx = goal.x - pl.x;
            const gy = goal.y - pl.y;
            const gd = Math.hypot(gx, gy);
            if (gd < 20) pickGoal();

            // Momentum: input accelerates, friction decays.
            jet = fuel > 0.05 && (jet ? Math.random() > 0.01 : Math.random() < 0.006);
            fuel = clamp(fuel + (jet ? -0.5 : 0.25) * dt, 0, 1);
            const accel = jet ? 900 : 520;
            pl.vx += (gx / (gd || 1)) * accel * dt;
            pl.vy += (gy / (gd || 1)) * accel * dt;
            const friction = Math.pow(0.85, dt * 30);
            pl.vx *= friction;
            pl.vy *= friction;

            // Sweep: cast along this frame's motion and stop at the first hit, then slide.
            let mx = pl.vx * dt;
            let my = pl.vy * dt;
            for (let iter = 0; iter < 3; iter++) {
                const len = Math.hypot(mx, my);
                if (len < 1e-6) break;
                let best = null;
                for (const b of boxes) {
                    const hit = raycast(pl.x, pl.y, mx / len, my / len, b, R);
                    if (hit && hit.t <= len && (!best || hit.t < best.t)) best = hit;
                }
                if (!best) {
                    pl.x += mx;
                    pl.y += my;
                    break;
                }
                const safe = Math.max(0, best.t - 0.5);
                pl.x += (mx / len) * safe;
                pl.y += (my / len) * safe;
                const remaining = len - safe;
                // Remove the normal component of the remaining motion and of the velocity.
                const rx = (mx / len) * remaining;
                const ry = (my / len) * remaining;
                const dot = rx * best.nx + ry * best.ny;
                mx = rx - dot * best.nx;
                my = ry - dot * best.ny;
                const vdot = pl.vx * best.nx + pl.vy * best.ny;
                pl.vx -= vdot * best.nx;
                pl.vy -= vdot * best.ny;
                hits++;
                lastHit = { x: pl.x - best.nx * R, y: pl.y - best.ny * R, nx: best.nx, ny: best.ny, age: 0 };
            }
            // Depenetrate in case we started overlapping something.
            for (const b of boxes) {
                const cx = clamp(pl.x, b.x, b.x + b.w);
                const cy = clamp(pl.y, b.y, b.y + b.h);
                const dx = pl.x - cx;
                const dy = pl.y - cy;
                const d = Math.hypot(dx, dy);
                if (d < R) {
                    if (d > 1e-6) {
                        pl.x += (dx / d) * (R - d);
                        pl.y += (dy / d) * (R - d);
                    } else {
                        pl.y = b.y - R;
                    }
                }
            }
            pl.x = clamp(pl.x, R, W - R);
            pl.y = clamp(pl.y, R + 24, H - R);
            if (lastHit) lastHit.age += dt;

            trail.push([pl.x, pl.y, jet]);
            if (trail.length > 90) trail.shift();
        },
        draw(ctx, w, h, p) {
            // Floor grid.
            ctx.strokeStyle = rgba(p.fg, 0.05);
            for (let x = 0; x < w; x += 24) {
                ctx.beginPath();
                ctx.moveTo(x + 0.5, 24);
                ctx.lineTo(x + 0.5, h);
                ctx.stroke();
            }
            for (let y = 24; y < h; y += 24) {
                ctx.beginPath();
                ctx.moveTo(0, y + 0.5);
                ctx.lineTo(w, y + 0.5);
                ctx.stroke();
            }

            for (const b of boxes) {
                ctx.fillStyle = rgba(p.fg, 0.1);
                ctx.fillRect(b.x, b.y, b.w, b.h);
                ctx.strokeStyle = rgba(p.fg, 0.4);
                ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
                // Expanded hull the sphere actually collides with.
                ctx.setLineDash([2, 4]);
                ctx.strokeStyle = rgba(p.fg, 0.14);
                ctx.beginPath();
                ctx.roundRect(b.x - R, b.y - R, b.w + 2 * R, b.h + 2 * R, R);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            trail.forEach(([x, y, j], i) => {
                ctx.fillStyle = j ? rgba(p.c, (i / trail.length) * 0.8) : ramp(p, 0.3, (i / trail.length) * 0.5);
                ctx.beginPath();
                ctx.arc(x, y, j ? 2.2 : 1.4, 0, TAU);
                ctx.fill();
            });

            // Look-ahead ray.
            const sp = Math.hypot(pl.vx, pl.vy);
            if (sp > 1) {
                const dx = pl.vx / sp;
                const dy = pl.vy / sp;
                let reach = 90;
                for (const b of boxes) {
                    const hit = raycast(pl.x, pl.y, dx, dy, b, R);
                    if (hit && hit.t < reach) reach = hit.t;
                }
                ctx.strokeStyle = rgba(p.a, 0.8);
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(pl.x, pl.y);
                ctx.lineTo(pl.x + dx * reach, pl.y + dy * reach);
                ctx.stroke();
                ctx.setLineDash([]);
                if (reach < 90) {
                    ctx.strokeStyle = rgba(p.a, 0.9);
                    ctx.beginPath();
                    ctx.arc(pl.x + dx * reach, pl.y + dy * reach, R, 0, TAU);
                    ctx.stroke();
                }
            }

            if (lastHit && lastHit.age < 0.6) {
                const a = 1 - lastHit.age / 0.6;
                ctx.strokeStyle = rgba(p.c, a);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(lastHit.x, lastHit.y);
                ctx.lineTo(lastHit.x + lastHit.nx * 22, lastHit.y + lastHit.ny * 22);
                ctx.stroke();
                ctx.lineWidth = 1;
            }

            ctx.fillStyle = rgba(p.fg, 0.95);
            ctx.beginPath();
            ctx.arc(pl.x, pl.y, R, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = rgba(p.bg, 0.9);
            ctx.beginPath();
            ctx.moveTo(pl.x, pl.y);
            ctx.lineTo(pl.x + (pl.vx / (sp || 1)) * R, pl.y + (pl.vy / (sp || 1)) * R);
            ctx.stroke();

            // HUD.
            mono(ctx, 11, rgba(p.fg, 0.55));
            ctx.textBaseline = "top";
            ctx.fillText(`v ${(sp / 30).toFixed(1)} m/s   hits ${hits}`, 14, 6);
            const fx = w - 14 - 90;
            ctx.fillText(jet ? "jet" : "fuel", fx - 34, 6);
            ctx.strokeStyle = rgba(p.fg, 0.35);
            ctx.strokeRect(fx + 0.5, 8.5, 90, 8);
            ctx.fillStyle = jet ? rgba(p.c, 0.9) : rgba(p.fg, 0.6);
            ctx.fillRect(fx + 2, 10, 87 * fuel, 5);
        },
    };
}
