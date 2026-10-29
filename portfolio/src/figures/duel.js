import { TAU, clamp, mix, mono, rand, rgba } from "./util.js";

// HotStreak: two bots duel on a procedurally placed map. Each one runs a small state machine
// (search → engage → reload / cover), finds its way with BFS over a coarse nav grid, only sees
// what is inside its view cone, and moves with the same momentum and sphere-swept sliding as
// the player.
const WW = 480;
const WH = 320;
const R = 8;
const CELL = 10;
const GC = WW / CELL;
const GR = WH / CELL;
const FOV = 1.9;
const SIGHT = 320;
const MAG = 8;
const RELOAD = 1.5;
const FIRE = 0.17;
const DMG = 17;
const BULLET = 900;
const REACTION = 0.25;
const STATES = ["search", "engage", "cover", "reload"];
// Transitions drawn in the panel, as [from, to] indices into STATES.
const EDGES = [
    [0, 1],
    [1, 3],
    [1, 2],
    [2, 0],
    [3, 0],
    [2, 3],
];

function arena() {
    const boxes = [];
    let tries = 0;
    while (boxes.length < 8 && tries++ < 300) {
        const bw = rand(26, 80);
        const bh = rand(20, 64);
        const b = { x: rand(36, WW - bw - 36), y: rand(30, WH - bh - 30), w: bw, h: bh };
        if (boxes.every((o) => b.x > o.x + o.w + 34 || b.x + b.w + 34 < o.x || b.y > o.y + o.h + 34 || b.y + b.h + 34 < o.y)) boxes.push(b);
    }
    return boxes;
}

// Ray vs. box expanded by r (a Minkowski sum), slab method. Returns the hit distance and normal.
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

const angDiff = (a, b) => ((((b - a) % TAU) + TAU * 1.5) % TAU) - TAU / 2;

export default function duel() {
    let boxes = [];
    let blocked = new Uint8Array(GC * GR);
    let bots = [];
    let bullets = [];
    let sparks = [];
    let score = [0, 0];

    // Distance from the nearest box along a ray, capped at `max` and the arena walls.
    function rayLen(x, y, dx, dy, max, r = 0) {
        let t = max;
        if (dx > 1e-9) t = Math.min(t, (WW - x) / dx);
        if (dx < -1e-9) t = Math.min(t, -x / dx);
        if (dy > 1e-9) t = Math.min(t, (WH - y) / dy);
        if (dy < -1e-9) t = Math.min(t, -y / dy);
        for (const b of boxes) {
            const hit = raycast(x, y, dx, dy, b, r);
            if (hit && hit.t < t) t = hit.t;
        }
        return t;
    }

    function clear(x1, y1, x2, y2, r = 0) {
        const d = Math.hypot(x2 - x1, y2 - y1);
        if (d < 1e-6) return true;
        return rayLen(x1, y1, (x2 - x1) / d, (y2 - y1) / d, d, r) >= d - 0.01;
    }

    const cellOf = (x, y) => clamp(Math.floor(y / CELL), 0, GR - 1) * GC + clamp(Math.floor(x / CELL), 0, GC - 1);
    const centre = (i) => [(i % GC) * CELL + CELL / 2, Math.floor(i / GC) * CELL + CELL / 2];

    // Breadth-first distances (in cells, 8-connected without cutting corners) from one cell.
    function bfs(from) {
        const dist = new Int16Array(GC * GR).fill(-1);
        const q = new Int32Array(GC * GR);
        let head = 0;
        let tail = 0;
        dist[from] = 0;
        q[tail++] = from;
        while (head < tail) {
            const i = q[head++];
            const cx = i % GC;
            const cy = (i / GC) | 0;
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue;
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= GC || ny >= GR) continue;
                    const j = ny * GC + nx;
                    if (blocked[j] || dist[j] >= 0) continue;
                    if (dx && dy && (blocked[cy * GC + nx] || blocked[ny * GC + cx])) continue;
                    dist[j] = dist[i] + 1;
                    q[tail++] = j;
                }
        }
        return dist;
    }

    function freeSpot(test) {
        for (let k = 0; k < 200; k++) {
            const x = rand(R + 4, WW - R - 4);
            const y = rand(R + 4, WH - R - 4);
            if (!blocked[cellOf(x, y)] && test(x, y)) return [x, y];
        }
        return [WW / 2, WH / 2];
    }

    function makeBot(i) {
        return { i, x: 0, y: 0, vx: 0, vy: 0, aim: 0, hp: 100, ammo: MAG, state: 0, reason: "spawned", edge: null, edgeT: 9, target: null, field: null, fieldKey: -1, path: [], lastSeen: null, heard: null, heardT: 0, seenT: 0, lostT: 9, cool: 0, reloadT: 0, coverT: 0, strafe: 1, strafeT: 0, hurtT: 9, deadT: 0 };
    }

    function spawn(b, other) {
        const side = b.i === 0 ? [0, WW * 0.3] : [WW * 0.7, WW];
        [b.x, b.y] = freeSpot((x, y) => x > side[0] && x < side[1] && (!other || other.deadT > 0 || Math.hypot(x - other.x, y - other.y) > 220));
        b.vx = b.vy = 0;
        b.aim = b.i === 0 ? 0 : Math.PI;
        b.hp = 100;
        b.ammo = MAG;
        b.state = 0;
        b.reason = "respawned";
        b.lastSeen = null;
        b.target = null;
        b.deadT = 0;
        b.seenT = 0;
        b.lostT = 9;
    }

    function reset() {
        boxes = arena();
        blocked = new Uint8Array(GC * GR);
        for (let i = 0; i < GC * GR; i++) {
            const [x, y] = centre(i);
            const pad = R + 3;
            if (x < pad || y < pad || x > WW - pad || y > WH - pad) blocked[i] = 1;
            for (const b of boxes) if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) blocked[i] = 1;
        }
        bots = [makeBot(0), makeBot(1)];
        spawn(bots[0], null);
        spawn(bots[1], bots[0]);
        for (const b of bots) b.reason = "spawned";
        bullets = [];
        sparks = [];
        score = [0, 0];
    }
    reset();

    function go(b, s, reason) {
        if (b.state === s) return;
        b.edge = [b.state, s];
        b.edgeT = 0;
        b.state = s;
        b.reason = reason;
        b.coverT = 0;
        if (s === 2 || s === 3) b.target = null;
    }

    function canSee(b, e) {
        if (e.deadT > 0) return false;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d > SIGHT) return false;
        if (Math.abs(angDiff(b.aim, Math.atan2(dy, dx))) > FOV / 2) return false;
        return clear(b.x, b.y, e.x, e.y);
    }

    // The nearest reachable cell the enemy can't see, a little away from them.
    function pickCover(b, e) {
        const from = bfs(cellOf(b.x, b.y));
        let best = -1;
        let bestScore = Infinity;
        for (let i = 0; i < GC * GR; i += 2) {
            if (from[i] < 0) continue;
            const [x, y] = centre(i);
            const de = Math.hypot(x - e.x, y - e.y);
            if (de < 70 || clear(e.x, e.y, x, y, 2)) continue;
            const s = from[i] - de * 0.02;
            if (s < bestScore) (bestScore = s), (best = i);
        }
        return best >= 0 ? centre(best) : [b.x, b.y];
    }

    // Walk down the BFS field towards the target, then steer at the furthest point still in reach.
    function navigate(b) {
        if (!b.target) {
            b.path = [];
            return null;
        }
        const key = cellOf(b.target[0], b.target[1]);
        if (key !== b.fieldKey) {
            b.field = bfs(key);
            b.fieldKey = key;
        }
        const f = b.field;
        let i = cellOf(b.x, b.y);
        const path = [];
        for (let k = 0; k < 80 && f[i] > 0; k++) {
            const cx = i % GC;
            const cy = (i / GC) | 0;
            let next = -1;
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= GC || ny >= GR) continue;
                    const j = ny * GC + nx;
                    if (f[j] >= 0 && f[j] < f[i] && (next < 0 || f[j] < f[next])) next = j;
                }
            if (next < 0) break;
            i = next;
            path.push(centre(i));
        }
        path.push(b.target);
        b.path = path;
        let aim = path[0];
        for (let k = Math.min(path.length - 1, 10); k >= 0; k--) {
            if (clear(b.x, b.y, path[k][0], path[k][1], R - 1)) {
                aim = path[k];
                break;
            }
        }
        const dx = aim[0] - b.x;
        const dy = aim[1] - b.y;
        const d = Math.hypot(dx, dy);
        return d < 3 ? null : [dx / d, dy / d];
    }

    function move(b, dir, accel, dt) {
        if (dir) {
            b.vx += dir[0] * accel * dt;
            b.vy += dir[1] * accel * dt;
        }
        const friction = Math.pow(0.85, dt * 30);
        b.vx *= friction;
        b.vy *= friction;
        // Sweep along this frame's motion and slide along whatever it hits.
        let mx = b.vx * dt;
        let my = b.vy * dt;
        for (let iter = 0; iter < 3; iter++) {
            const len = Math.hypot(mx, my);
            if (len < 1e-6) break;
            let best = null;
            for (const box of boxes) {
                const hit = raycast(b.x, b.y, mx / len, my / len, box, R);
                if (hit && hit.t <= len && (!best || hit.t < best.t)) best = hit;
            }
            if (!best) {
                b.x += mx;
                b.y += my;
                break;
            }
            const safe = Math.max(0, best.t - 0.5);
            b.x += (mx / len) * safe;
            b.y += (my / len) * safe;
            const rx = (mx / len) * (len - safe);
            const ry = (my / len) * (len - safe);
            const dot = rx * best.nx + ry * best.ny;
            mx = rx - dot * best.nx;
            my = ry - dot * best.ny;
            const vdot = b.vx * best.nx + b.vy * best.ny;
            b.vx -= vdot * best.nx;
            b.vy -= vdot * best.ny;
        }
        for (const box of boxes) {
            const cx = clamp(b.x, box.x, box.x + box.w);
            const cy = clamp(b.y, box.y, box.y + box.h);
            const d = Math.hypot(b.x - cx, b.y - cy);
            if (d < R && d > 1e-6) {
                b.x += ((b.x - cx) / d) * (R - d);
                b.y += ((b.y - cy) / d) * (R - d);
            }
        }
        b.x = clamp(b.x, R, WW - R);
        b.y = clamp(b.y, R, WH - R);
    }

    function fire(b) {
        const sp = Math.hypot(b.vx, b.vy);
        const spread = 0.025 + Math.min(1, sp / 110) * 0.08;
        const a = b.aim + rand(-spread, spread);
        bullets.push({ x: b.x + Math.cos(b.aim) * R, y: b.y + Math.sin(b.aim) * R, dx: Math.cos(a), dy: Math.sin(a), owner: b.i, px: b.x, py: b.y, life: 0.6 });
        b.ammo--;
        b.cool = FIRE;
    }

    function think(b, e, dt) {
        b.edgeT += dt;
        b.cool -= dt;
        b.hurtT += dt;
        b.strafeT -= dt;
        if (b.deadT > 0) {
            b.deadT -= dt;
            if (b.deadT <= 0) spawn(b, e);
            return;
        }

        const see = canSee(b, e);
        if (see) {
            b.lastSeen = [e.x, e.y];
            b.seenT += dt;
            b.lostT = 0;
        } else {
            b.seenT = 0;
            b.lostT += dt;
        }
        // Footsteps: a rough idea of where the enemy is, refreshed every so often.
        b.heardT -= dt;
        if (b.heardT <= 0 && e.deadT <= 0) {
            b.heard = [clamp(e.x + rand(-40, 40), 20, WW - 20), clamp(e.y + rand(-40, 40), 20, WH - 20)];
            b.heardT = rand(1.4, 2.2);
        }

        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const dist = Math.hypot(dx, dy);
        let dir = null;
        let accel = 520;
        let want = null;

        if (b.state === 0) {
            // Search: head for where the enemy was last seen, otherwise where they were heard.
            if (see) go(b, 1, `spotted at ${Math.round(dist)}u`);
            else {
                if (b.lastSeen && Math.hypot(b.lastSeen[0] - b.x, b.lastSeen[1] - b.y) < 16) {
                    b.lastSeen = null;
                    b.reason = "last seen: empty";
                }
                b.target = b.lastSeen || b.heard;
                dir = navigate(b);
                if (b.lastSeen && b.lostT < 3) want = Math.atan2(b.lastSeen[1] - b.y, b.lastSeen[0] - b.x);
            }
        }
        if (b.state === 1) {
            // Engage: strafe across the line of fire, hold a comfortable range, shoot once on target.
            if (b.ammo <= 0) go(b, 3, "mag empty");
            else if (b.hp < 40 && e.hp > b.hp) go(b, 2, `hp ${Math.round(b.hp)}, falling back`);
            else if (!see && b.lostT > 0.6) go(b, 0, "lost sight");
            else {
                if (b.strafeT <= 0 || Math.hypot(b.vx, b.vy) < 15) {
                    b.strafe = Math.random() < 0.5 ? -1 : 1;
                    b.strafeT = rand(0.5, 1.1);
                }
                const ux = dx / (dist || 1);
                const uy = dy / (dist || 1);
                const band = dist > 210 ? 0.8 : dist < 90 ? -0.8 : 0;
                const sx = -uy * b.strafe + ux * band;
                const sy = ux * b.strafe + uy * band;
                const sl = Math.hypot(sx, sy) || 1;
                dir = [sx / sl, sy / sl];
                accel = 330;
                if (!see && b.lastSeen) {
                    b.target = b.lastSeen;
                    dir = navigate(b);
                }
                // Lead the target a little.
                const lead = dist / BULLET;
                want = Math.atan2(e.y + e.vy * lead - b.y, e.x + e.vx * lead - b.x);
                b.path = see ? [] : b.path;
            }
        }
        if (b.state === 2 || b.state === 3) {
            // Cover / reload: get somewhere the enemy can't see.
            b.coverT += dt;
            if (!b.target || (b.coverT > 0.5 && clear(e.x, e.y, b.target[0], b.target[1], 2) && e.deadT <= 0)) {
                b.target = pickCover(b, e);
                b.coverT = 0.01;
            }
            dir = navigate(b);
            if (see) want = Math.atan2(dy, dx);
            else if (b.lastSeen) want = Math.atan2(b.lastSeen[1] - b.y, b.lastSeen[0] - b.x);
            if (b.state === 3) {
                b.reloadT += dt;
                if (b.reloadT >= RELOAD) {
                    b.reloadT = 0;
                    b.ammo = MAG;
                    if (b.hp < 40) go(b, 2, "reloaded, still hurt");
                    else go(b, see ? 1 : 0, "reloaded");
                }
            } else {
                if (b.lostT > 1) b.hp = Math.min(100, b.hp + 28 * dt);
                if (b.hp >= 85) go(b, 0, "healed");
                else if (b.ammo < MAG && !see) go(b, 3, "topping up mag");
            }
        }

        move(b, dir, accel, dt);

        // Turn towards what it cares about, or where it's going.
        if (want === null) {
            const sp = Math.hypot(b.vx, b.vy);
            want = sp > 20 ? Math.atan2(b.vy, b.vx) : b.aim;
        }
        const rate = b.state === 1 ? 7 : 4.5;
        const da = angDiff(b.aim, want);
        b.aim += clamp(da, -rate * dt, rate * dt);

        const shooting = b.state === 1 || (b.state === 2 && b.ammo > 0);
        if (shooting && see && b.seenT > REACTION && b.cool <= 0 && b.ammo > 0 && Math.abs(da) < 0.09) fire(b);
    }

    function stepBullets(dt) {
        // Bullets that stopped last step have been drawn once at their impact point; drop them now.
        bullets = bullets.filter((u) => u.life > 0);
        for (const u of bullets) {
            u.px = u.x;
            u.py = u.y;
            const len = BULLET * dt;
            const wall = rayLen(u.x, u.y, u.dx, u.dy, len);
            const e = bots[1 - u.owner];
            let hitT = Infinity;
            if (e.deadT <= 0) {
                // Segment vs. circle.
                const fx = u.x - e.x;
                const fy = u.y - e.y;
                const bq = fx * u.dx + fy * u.dy;
                const c = fx * fx + fy * fy - R * R;
                const disc = bq * bq - c;
                if (disc >= 0) {
                    const t = -bq - Math.sqrt(disc);
                    if (t >= 0 && t <= len) hitT = t;
                }
            }
            if (hitT < wall) {
                u.x += u.dx * hitT;
                u.y += u.dy * hitT;
                u.life = 0;
                e.hp -= DMG;
                e.hurtT = 0;
                e.lastSeen = [bots[u.owner].x, bots[u.owner].y];
                sparks.push({ x: u.x, y: u.y, age: 0, hit: true, owner: u.owner });
                if (e.hp <= 0) {
                    e.hp = 0;
                    e.deadT = 1.8;
                    e.state = 0;
                    e.edge = null;
                    e.reason = "eliminated";
                    e.path = [];
                    score[u.owner]++;
                    const k = bots[u.owner];
                    k.lastSeen = null;
                    k.reason = "got the kill";
                }
            } else if (wall < len) {
                u.x += u.dx * wall;
                u.y += u.dy * wall;
                u.life = 0;
                sparks.push({ x: u.x, y: u.y, age: 0, hit: false, owner: u.owner });
            } else {
                u.x += u.dx * len;
                u.y += u.dy * len;
                u.life -= dt;
            }
        }
        for (const s of sparks) s.age += dt;
        sparks = sparks.filter((s) => s.age < 0.4);
    }

    function layout(w, h) {
        const top = 30;
        const wide = w > 560;
        const availH = h - top - 12;
        const aw = Math.min(wide ? w * 0.6 : w - 24, availH * (WW / WH));
        const s = aw / WW;
        const ah = WH * s;
        const ax = wide ? 12 : (w - aw) / 2;
        const ay = top + (availH - ah) / 2;
        const px = ax + aw + Math.max(20, w * 0.035);
        return { s, ax, ay, aw, ah, wide, panel: wide ? { x: px, y: top, w: w - px - 12, h: availH } : null };
    }

    // One bot's state machine: four nodes in a 2 × 2 grid, the live one filled.
    function drawMachine(ctx, b, x, y, w, h, p) {
        const col = b.i === 0 ? p.b : p.d;
        ctx.textBaseline = "top";
        mono(ctx, 11, rgba(col, 0.95), 600);
        ctx.fillText(b.i === 0 ? "blue" : "orange", x, y);
        mono(ctx, 11, rgba(p.fg, 0.5));
        const stats = b.deadT > 0 ? `respawn ${b.deadT.toFixed(1)}s` : `hp ${String(Math.round(b.hp)).padStart(3)}   ammo ${b.ammo}/${MAG}`;
        ctx.textAlign = "right";
        ctx.fillText(stats, x + w, y);
        ctx.textAlign = "left";

        const nw = Math.min(124, (w - 28) / 2);
        const nh = 22;
        const gx = 28;
        const gy = clamp(h - 84, 14, 30);
        const ox = x + (w - nw * 2 - gx) / 2;
        const oy = y + 24;
        const pos = STATES.map((_, k) => [ox + (k % 2) * (nw + gx), oy + Math.floor(k / 2) * (nh + gy)]);
        const mid = (k) => [pos[k][0] + nw / 2, pos[k][1] + nh / 2];

        // Edges, clipped to the node boxes; the one just taken is lit with an arrowhead.
        for (const [a, c] of EDGES) {
            const lit = b.edge && b.edge[0] === a && b.edge[1] === c && b.edgeT < 1.2;
            const [x1, y1] = mid(a);
            const [x2, y2] = mid(c);
            const dx = x2 - x1;
            const dy = y2 - y1;
            const clip = (sx) => Math.min(Math.abs(nw / 2 / (dx || 1e-9)), Math.abs(nh / 2 / (dy || 1e-9))) * sx;
            const t0 = clip(1) + 0.02;
            const t1 = 1 - t0;
            const ax = x1 + dx * t0;
            const ay = y1 + dy * t0;
            const bx = x1 + dx * t1;
            const by = y1 + dy * t1;
            ctx.strokeStyle = lit ? rgba(col, 1 - b.edgeT / 1.6) : rgba(p.fg, 0.16);
            ctx.lineWidth = lit ? 1.5 : 1;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
            if (lit) {
                const ang = Math.atan2(dy, dx);
                ctx.fillStyle = ctx.strokeStyle;
                ctx.beginPath();
                ctx.moveTo(bx, by);
                ctx.lineTo(bx - Math.cos(ang - 0.45) * 7, by - Math.sin(ang - 0.45) * 7);
                ctx.lineTo(bx - Math.cos(ang + 0.45) * 7, by - Math.sin(ang + 0.45) * 7);
                ctx.fill();
            }
        }
        ctx.lineWidth = 1;

        STATES.forEach((name, k) => {
            const [nx, ny] = pos[k];
            const on = b.deadT <= 0 && b.state === k;
            ctx.fillStyle = on ? rgba(col, 0.22) : rgba(p.bg, 0.9);
            ctx.fillRect(nx, ny, nw, nh);
            ctx.strokeStyle = on ? rgba(col, 0.95) : rgba(p.fg, 0.22);
            ctx.strokeRect(nx + 0.5, ny + 0.5, nw - 1, nh - 1);
            if (on && k === 3) {
                ctx.fillStyle = rgba(col, 0.35);
                ctx.fillRect(nx + 1, ny + nh - 4, (nw - 2) * (b.reloadT / RELOAD), 3);
            }
            mono(ctx, 11, on ? rgba(p.fg, 0.95) : rgba(p.fg, 0.45), on ? 600 : 400);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(name, nx + nw / 2, ny + nh / 2 + 0.5);
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
        });

        mono(ctx, 11, rgba(p.fg, 0.45));
        ctx.fillText(`→ ${b.reason}`, ox, oy + nh * 2 + gy + 10);
    }

    return {
        step(dt) {
            dt = Math.min(dt, 1 / 30);
            if (!dt) return;
            think(bots[0], bots[1], dt);
            think(bots[1], bots[0], dt);
            stepBullets(dt);
        },
        draw(ctx, w, h, p) {
            const L = layout(w, h);
            const { s, ax, ay } = L;
            const X = (x) => ax + x * s;
            const Y = (y) => ay + y * s;

            // Floor grid at the nav-grid resolution (every other line).
            ctx.strokeStyle = rgba(p.fg, 0.04);
            ctx.lineWidth = 1;
            for (let c = 0; c <= GC; c += 2) {
                ctx.beginPath();
                ctx.moveTo(Math.round(X(c * CELL)) + 0.5, Y(0));
                ctx.lineTo(Math.round(X(c * CELL)) + 0.5, Y(WH));
                ctx.stroke();
            }
            for (let r = 0; r <= GR; r += 2) {
                ctx.beginPath();
                ctx.moveTo(X(0), Math.round(Y(r * CELL)) + 0.5);
                ctx.lineTo(X(WW), Math.round(Y(r * CELL)) + 0.5);
                ctx.stroke();
            }
            ctx.strokeStyle = rgba(p.fg, 0.35);
            ctx.strokeRect(Math.round(X(0)) + 0.5, Math.round(Y(0)) + 0.5, Math.round(WW * s) - 1, Math.round(WH * s) - 1);

            // View cones, cut off by cover.
            for (const b of bots) {
                if (b.deadT > 0) continue;
                const col = b.i === 0 ? p.b : p.d;
                ctx.fillStyle = rgba(col, b.state === 1 ? 0.14 : 0.08);
                ctx.strokeStyle = rgba(col, 0.25);
                ctx.beginPath();
                ctx.moveTo(X(b.x), Y(b.y));
                const n = 40;
                for (let k = 0; k <= n; k++) {
                    const a = b.aim - FOV / 2 + (FOV * k) / n;
                    const dx = Math.cos(a);
                    const dy = Math.sin(a);
                    const t = rayLen(b.x, b.y, dx, dy, SIGHT);
                    ctx.lineTo(X(b.x + dx * t), Y(b.y + dy * t));
                }
                ctx.closePath();
                ctx.fill();
            }

            for (const b of boxes) {
                ctx.fillStyle = rgba(p.fg, 0.1);
                ctx.fillRect(X(b.x), Y(b.y), b.w * s, b.h * s);
                ctx.strokeStyle = rgba(p.fg, 0.4);
                ctx.strokeRect(X(b.x) + 0.5, Y(b.y) + 0.5, b.w * s - 1, b.h * s - 1);
            }

            // Planned routes and memory.
            for (const b of bots) {
                if (b.deadT > 0) continue;
                const col = b.i === 0 ? p.b : p.d;
                if (b.path.length > 1) {
                    ctx.strokeStyle = rgba(col, 0.45);
                    ctx.setLineDash([2, 4]);
                    ctx.beginPath();
                    ctx.moveTo(X(b.x), Y(b.y));
                    for (const [x, y] of b.path) ctx.lineTo(X(x), Y(y));
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
                if (b.lastSeen && b.lostT > 0.2 && b.state !== 1) {
                    const [lx, ly] = [X(b.lastSeen[0]), Y(b.lastSeen[1])];
                    ctx.strokeStyle = rgba(col, 0.7);
                    ctx.beginPath();
                    ctx.moveTo(lx - 4, ly - 4);
                    ctx.lineTo(lx + 4, ly + 4);
                    ctx.moveTo(lx + 4, ly - 4);
                    ctx.lineTo(lx - 4, ly + 4);
                    ctx.stroke();
                }
            }

            // Tracers.
            ctx.lineWidth = 1.5;
            for (const u of bullets) {
                const col = u.owner === 0 ? p.b : p.d;
                ctx.strokeStyle = rgba(col, 0.9);
                ctx.beginPath();
                ctx.moveTo(X(u.px), Y(u.py));
                ctx.lineTo(X(u.x), Y(u.y));
                ctx.stroke();
            }
            ctx.lineWidth = 1;
            for (const k of sparks) {
                const a = 1 - k.age / 0.4;
                ctx.strokeStyle = k.hit ? rgba(p.fg, a) : rgba(p.fg, a * 0.5);
                ctx.beginPath();
                ctx.arc(X(k.x), Y(k.y), ((k.hit ? 3 : 1.5) + k.age * (k.hit ? 22 : 9)) * s, 0, TAU);
                ctx.stroke();
            }

            const r = Math.max(4, R * s);
            for (const b of bots) {
                const col = b.i === 0 ? p.b : p.d;
                if (b.deadT > 0) {
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    mono(ctx, 12, rgba(col, 0.5), 600);
                    ctx.fillText("×", X(b.x), Y(b.y));
                    ctx.textAlign = "left";
                    continue;
                }
                ctx.fillStyle = b.hurtT < 0.1 ? mix(col, p.fg, 0.55) : rgba(col, 0.95);
                ctx.beginPath();
                ctx.arc(X(b.x), Y(b.y), r, 0, TAU);
                ctx.fill();
                // Barrel.
                ctx.strokeStyle = rgba(p.fg, 0.9);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(X(b.x) + Math.cos(b.aim) * r * 0.4, Y(b.y) + Math.sin(b.aim) * r * 0.4);
                ctx.lineTo(X(b.x) + Math.cos(b.aim) * r * 1.7, Y(b.y) + Math.sin(b.aim) * r * 1.7);
                ctx.stroke();
                ctx.lineWidth = 1;
                // Health ring.
                ctx.strokeStyle = rgba(col, 0.6);
                ctx.beginPath();
                ctx.arc(X(b.x), Y(b.y), r + 3, -Math.PI / 2, -Math.PI / 2 + TAU * (b.hp / 100));
                ctx.stroke();
                if (!L.wide) {
                    mono(ctx, 10, rgba(col, 0.9));
                    ctx.textAlign = "center";
                    ctx.textBaseline = "bottom";
                    ctx.fillText(STATES[b.state], X(b.x), Math.max(Y(b.y) - r - 6, 38));
                    ctx.textAlign = "left";
                }
            }

            // HUD.
            ctx.textBaseline = "top";
            mono(ctx, 11, rgba(p.b, 0.9));
            ctx.fillText(`blue ${score[0]}`, 14, 8);
            mono(ctx, 11, rgba(p.fg, 0.4));
            ctx.fillText("–", 14 + ctx.measureText(`blue ${score[0]} `).width, 8);
            mono(ctx, 11, rgba(p.d, 0.9));
            ctx.fillText(`${score[1]} orange`, 14 + ctx.measureText(`blue ${score[0]} – `).width, 8);
            if (w > 520) {
                ctx.textAlign = "right";
                mono(ctx, 11, rgba(p.fg, 0.45));
                ctx.fillText(`nav: BFS on a ${GC} × ${GR} grid · view cone ${Math.round((FOV * 180) / Math.PI)}°`, w - 14, 8);
                ctx.textAlign = "left";
            }

            if (L.panel) {
                const P = L.panel;
                const blockH = Math.min(P.h / 2 - 12, 130);
                const gap = clamp(P.h - blockH * 2, 0, 56);
                const y0 = P.y + (P.h - blockH * 2 - gap) / 2;
                bots.forEach((b, k) => drawMachine(ctx, b, P.x, y0 + k * (blockH + gap), P.w, blockH, p));
            }
        },
    };
}
