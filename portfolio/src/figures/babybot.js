import { TAU, clamp, mono, rgba, ramp } from "./util.js";

// BabyBot playing itself, beside its own network. The weights are the trained checkpoint
// (a shared 193 → 512 → 512 trunk into a 512 × 3 policy head with 90 actions), run here in
// JavaScript for both cars. The physics is a small stand-in for RocketSim, so the play is
// approximate, but every input is built the way BetterObs builds it and every decision
// is the network's own.

const DT = 1 / 120;
const TICK_SKIP = 8;
const BALL_R = 92.75;
const POS = 1 / 5000;
const VEL = 1 / 2300;
const ANG = 1 / 3;
const PRED_TICKS = [11, 29, 59, 119, 179, 239, 359];
const PADS = [
    [0, -4240, 0], [-1792, -4184, 0], [1792, -4184, 0], [-3072, -4096, 1], [3072, -4096, 1], [-940, -3308, 0], [940, -3308, 0],
    [0, -2816, 0], [-3584, -2484, 0], [3584, -2484, 0], [-1788, -2300, 0], [1788, -2300, 0], [-2048, -1036, 0], [0, -1024, 0],
    [2048, -1036, 0], [-3584, 0, 1], [-1024, 0, 0], [1024, 0, 0], [3584, 0, 1], [-2048, 1036, 0], [0, 1024, 0], [2048, 1036, 0],
    [-1788, 2300, 0], [1788, 2300, 0], [-3584, 2484, 0], [3584, 2484, 0], [0, 2816, 0], [-940, 3310, 0], [940, 3308, 0],
    [-3072, 4096, 1], [3072, 4096, 1], [-1792, 4184, 0], [1792, 4184, 0], [0, 4240, 0],
];
const KICKOFFS = [
    [-2048, -2560, Math.PI / 4],
    [2048, -2560, (3 * Math.PI) / 4],
    [-256, -3840, Math.PI / 2],
    [256, -3840, Math.PI / 2],
    [0, -4608, Math.PI / 2],
];
// Octane hitbox half-extents and offset from the car's origin, in car space.
const HB = [59, 42.1, 18.1];
const HOFF = [13.88, 0, 20.75];
// Groups of the 193 inputs, in BetterObs order.
// The arena's corners are cut at 45°: |x| + |y| stays under this.
const CORNER = 8064;
const FIELD_OUTLINE = [
    [2944, 5120], [4096, 3968], [4096, -3968], [2944, -5120],
    [-2944, -5120], [-4096, -3968], [-4096, 3968], [-2944, 5120],
];
const OBS_GROUPS = [
    ["ball", 9],
    ["last action", 8],
    ["boost pads", 34],
    ["self", 29],
    ["opponent", 29],
    ["ball path", 84],
];

// The 90-action lookup table: 24 ground actions, then 66 air actions.
// Each row is [throttle, steer, pitch, yaw, roll, jump, boost, handbrake].
export const ACTIONS = (() => {
    const out = [];
    for (const th of [-1, 0, 1])
        for (const st of [-1, 0, 1])
            for (const bo of [0, 1])
                for (const hb of [0, 1]) if (!(bo === 1 && th !== 1)) out.push([th || bo, st, 0, st, 0, 0, bo, hb]);
    for (const pi of [-1, 0, 1])
        for (const ya of [-1, 0, 1])
            for (const ro of [-1, 0, 1])
                for (const ju of [0, 1])
                    for (const bo of [0, 1]) {
                        if (ju === 1 && ya !== 0) continue;
                        if (pi === 0 && ro === 0 && ju === 0) continue;
                        out.push([bo, ya, pi, ya, ro, ju, bo, ju === 1 && (pi || ya || ro) ? 1 : 0]);
                    }
    return out;
})();

function describe(a) {
    const [th, st, pi, ya, ro, ju, bo, hb] = a;
    const parts = [];
    if (ju) parts.push(pi || ro ? "flip" : "jump");
    if (th && !ju) parts.push(th > 0 ? "throttle" : "reverse");
    if (st && !pi && !ro && !ju) parts.push(st > 0 ? "steer right" : "steer left");
    if (pi && !ju) parts.push(pi > 0 ? "nose up" : "nose down");
    if (ro && !ju) parts.push(ro > 0 ? "roll right" : "roll left");
    if (bo) parts.push("boost");
    if (hb && !ju) parts.push("powerslide");
    return parts.join(" · ") || "coast";
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

let netPromise = null;

function loadNet() {
    netPromise ??= fetch(`${import.meta.env?.BASE_URL ?? "/"}models/babybot-policy.bin`)
        .then((r) => {
            if (!r.ok) throw new Error(`weights: HTTP ${r.status}`);
            return r.arrayBuffer();
        })
        .then(parseNet);
    return netPromise;
}

// File layout: [u32 header length][JSON header][f32 biases and LayerNorm params][f16 weights].
export function parseNet(buf) {
    const headerLen = new DataView(buf).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headerLen)));
    const f32Base = 4 + headerLen;
    const f16Base = f32Base + header.f32Bytes;
    const half = new Float32Array(65536);
    for (let h = 0; h < 65536; h++) {
        const s = h & 0x8000 ? -1 : 1;
        const e = (h >> 10) & 31;
        const m = h & 1023;
        half[h] = e === 0 ? s * m * 2 ** -24 : e === 31 ? s * Infinity : s * (1 + m / 1024) * 2 ** (e - 15);
    }
    const f32 = (off, n) => new Float32Array(buf.slice(f32Base + off, f32Base + off + n * 4));
    return header.layers.map((L) => {
        const n = L.rows * L.cols;
        const raw = new Uint16Array(buf.slice(f16Base + L.w, f16Base + L.w + n * 2));
        const w = new Float32Array(n);
        for (let i = 0; i < n; i++) w[i] = half[raw[i]];
        return {
            rows: L.rows,
            cols: L.cols,
            w,
            b: f32(L.b, L.rows),
            g: L.g === undefined ? null : f32(L.g, L.rows),
            beta: L.beta === undefined ? null : f32(L.beta, L.rows),
            relu: L.relu,
            out: new Float32Array(L.rows),
        };
    });
}

// Linear → LayerNorm → ReLU blocks. Each layer keeps its output for drawing.
export function forward(net, x) {
    let inp = x;
    for (const L of net) {
        const { rows, cols, w, b, out } = L;
        for (let i = 0; i < rows; i++) {
            let s = b[i];
            const o = i * cols;
            for (let j = 0; j < cols; j++) s += w[o + j] * inp[j];
            out[i] = s;
        }
        if (L.g) {
            let mean = 0;
            for (let i = 0; i < rows; i++) mean += out[i];
            mean /= rows;
            let v = 0;
            for (let i = 0; i < rows; i++) v += (out[i] - mean) ** 2;
            const inv = 1 / Math.sqrt(v / rows + 1e-5);
            for (let i = 0; i < rows; i++) out[i] = (out[i] - mean) * inv * L.g[i] + L.beta[i];
        }
        if (L.relu) for (let i = 0; i < rows; i++) if (out[i] < 0) out[i] = 0;
        inp = out;
    }
    return inp;
}

// ---------------------------------------------------------------------------
// A small stand-in for RocketSim
// ---------------------------------------------------------------------------

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const axpy = (k, a, b) => [b[0] + k * a[0], b[1] + k * a[1], b[2] + k * a[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const interp = (x, xs, ys) => {
    if (x <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1]);
    return ys[ys.length - 1];
};
const curvature = (v) => interp(Math.abs(v), [0, 500, 1000, 1500, 1750, 2300], [0.0069, 0.00398, 0.00235, 0.001375, 0.0011, 0.00088]);
const throttleAccel = (v) => (Math.abs(v) < 1400 ? 1600 - Math.abs(v) * (1440 / 1400) : Math.max(0, 16 * (1410 - Math.abs(v))));

function makeCar(team) {
    return { team, prev: new Array(8).fill(0) };
}

function kickoffCar(c, spot) {
    let [x, y, yaw] = KICKOFFS[spot];
    if (c.team === 1) (x = -x), (y = -y), (yaw += Math.PI);
    Object.assign(c, {
        pos: [x, y, 17],
        vel: [0, 0, 0],
        f: [Math.cos(yaw), Math.sin(yaw), 0],
        r: [-Math.sin(yaw), Math.cos(yaw), 0],
        u: [0, 0, 1],
        w: [0, 0, 0], // local rates: roll, pitch, yaw
        boost: 33.3,
        ground: true,
        jumped: false,
        jumpT: 0,
        airT: 0,
        flipped: false,
        flipT: 0,
        flipDir: [0, 0],
        prevJump: 0,
        boosting: false,
        prev: new Array(8).fill(0),
    });
}

const hasFlip = (c) => c.ground || (!c.flipped && (!c.jumped || c.airT < 1.25));

function stepCar(c, a) {
    const [th, st, pi, ya, ro, ju, bo, hb] = a;
    c.boosting = bo > 0 && c.boost > 0;
    if (c.boosting) c.boost = Math.max(0, c.boost - 33.3 * DT);
    if (c.ground) {
        let fs = dot(c.vel, c.f);
        const t = c.boosting ? 1 : th;
        let acc;
        if (t * fs < -1) acc = -Math.sign(fs) * 3500;
        else if (t) acc = t * throttleAccel(fs);
        else acc = -Math.sign(fs) * Math.min(525, Math.abs(fs) / DT);
        if (c.boosting) acc += 991.67;
        fs = clamp(fs + acc * DT, -2300, 2300);
        const yawRate = st * curvature(fs) * (hb ? 1.6 : 1) * fs;
        c.w = [0, 0, yawRate];
        const ang = yawRate * DT;
        const co = Math.cos(ang);
        const si = Math.sin(ang);
        const f = [c.f[0] * co + c.r[0] * si, c.f[1] * co + c.r[1] * si, 0];
        c.r = [c.r[0] * co - c.f[0] * si, c.r[1] * co - c.f[1] * si, 0];
        c.f = f;
        const k = fs * (hb ? 0.995 : 1);
        c.vel = [f[0] * k, f[1] * k, 0];
        if (ju && !c.prevJump) {
            c.ground = false;
            c.jumped = true;
            c.jumpT = 0;
            c.airT = 0;
            c.vel = axpy(291.67, c.u, c.vel);
        }
    } else {
        c.airT += DT;
        if (c.jumped && c.jumpT < 0.2 && ju && !c.flipped) c.vel = axpy(1458.33 * DT, c.u, c.vel);
        c.jumpT += DT;
        if (ju && !c.prevJump && hasFlip(c) && c.airT > 0.05) {
            if (Math.abs(pi) + Math.abs(ya) + Math.abs(ro) >= 0.5) {
                const fl = Math.hypot(c.f[0], c.f[1]) || 1;
                const fx = c.f[0] / fl;
                const fy = c.f[1] / fl;
                c.vel = [c.vel[0] + (fx * -pi - fy * (ya + ro)) * 500, c.vel[1] + (fy * -pi + fx * (ya + ro)) * 500, c.vel[2] * 0.35];
                c.flipped = true;
                c.flipT = 0.65;
                c.flipDir = [-pi, ya + ro];
            } else {
                c.vel = axpy(291.67, c.u, c.vel);
                c.flipped = true;
            }
        }
        if (c.flipT > 0) {
            c.flipT -= DT;
            c.w = [5.5 * clamp(c.flipDir[1], -1, 1), -5.5 * c.flipDir[0], 0];
        } else {
            c.w = [
                clamp(c.w[0] + (ro * 38.34 - 4.47 * c.w[0]) * DT, -5.5, 5.5),
                clamp(c.w[1] + (pi * 12.46 - 2.798 * c.w[1] * (1 - Math.abs(pi))) * DT, -5.5, 5.5),
                clamp(c.w[2] + (ya * 9.11 - 1.886 * c.w[2] * (1 - Math.abs(ya))) * DT, -5.5, 5.5),
            ];
        }
        // Rotate the local frame: yaw turns f toward r, pitch turns f toward u, roll turns u toward r.
        const [wr, wp, wy] = c.w.map((v) => v * DT);
        let { f, r, u } = c;
        [f, r] = [axpy(wy, r, f), axpy(-wy, f, r)];
        [f, u] = [axpy(wp, u, f), axpy(-wp, f, u)];
        [u, r] = [axpy(wr, r, u), axpy(-wr, u, r)];
        const fl = len(f);
        f = f.map((v) => v / fl);
        u = axpy(-dot(u, f), f, u);
        const ul = len(u);
        u = u.map((v) => v / ul);
        c.f = f;
        c.u = u;
        c.r = cross(u, f);
        if (c.boosting) c.vel = axpy(1058 * DT, c.f, c.vel);
        c.vel[2] -= 650 * DT;
    }
    const sp = len(c.vel);
    if (sp > 2300) c.vel = c.vel.map((v) => (v * 2300) / sp);
    c.pos = axpy(DT, c.vel, c.pos);
    for (const [i, lim] of [
        [0, 4036],
        [1, 5060],
    ]) {
        if (Math.abs(c.pos[i]) > lim) {
            c.pos[i] = Math.sign(c.pos[i]) * lim;
            if (c.vel[i] * Math.sign(c.pos[i]) > 0) c.vel[i] = 0;
        }
    }
    cornerBounce(c.pos, c.vel, 60, 0);
    if (c.pos[2] > 2024) (c.pos[2] = 2024), (c.vel[2] = Math.min(0, c.vel[2]));
    if (!c.ground && c.pos[2] <= 17 && c.vel[2] <= 0) {
        const yaw = Math.atan2(c.f[1], c.f[0]);
        if (c.u[2] < 0.5) c.vel = c.vel.map((v) => v * 0.4);
        c.f = [Math.cos(yaw), Math.sin(yaw), 0];
        c.r = [-Math.sin(yaw), Math.cos(yaw), 0];
        c.u = [0, 0, 1];
        c.vel[2] = 0;
        Object.assign(c, { ground: true, jumped: false, flipped: false, flipT: 0 });
    }
    if (c.ground) c.pos[2] = 17;
    c.prevJump = ju;
}

// Push a body back inside a cut corner and reflect (restitution e) its velocity off it.
function cornerBounce(p, v, r, e) {
    const sx = Math.sign(p[0]) || 1;
    const sy = Math.sign(p[1]) || 1;
    const depth = r - (CORNER - Math.abs(p[0]) - Math.abs(p[1])) / Math.SQRT2;
    if (depth <= 0) return;
    const n = [-sx / Math.SQRT2, -sy / Math.SQRT2];
    p[0] += n[0] * depth;
    p[1] += n[1] * depth;
    const vn = v[0] * n[0] + v[1] * n[1];
    if (vn < 0) (v[0] -= (1 + e) * vn * n[0]), (v[1] -= (1 + e) * vn * n[1]);
}

function stepBall(b) {
    b.vel[2] -= 650 * DT;
    const drag = 1 - 0.0305 * DT;
    b.vel[0] *= drag;
    b.vel[1] *= drag;
    b.vel[2] *= drag;
    b.pos[0] += b.vel[0] * DT;
    b.pos[1] += b.vel[1] * DT;
    b.pos[2] += b.vel[2] * DT;
    const p = b.pos;
    const v = b.vel;
    if (p[2] < BALL_R) {
        p[2] = BALL_R;
        if (v[2] < 0) v[2] = v[2] < -60 ? -v[2] * 0.6 : 0;
        if (v[2] === 0) (v[0] *= 1 - 0.1 * DT), (v[1] *= 1 - 0.1 * DT);
    }
    if (p[2] > 2044 - BALL_R) (p[2] = 2044 - BALL_R), (v[2] = -Math.abs(v[2]) * 0.6);
    if (Math.abs(p[0]) > 4096 - BALL_R) (p[0] = Math.sign(p[0]) * (4096 - BALL_R)), (v[0] = -v[0] * 0.6);
    const inMouth = Math.abs(p[0]) < 892.755 - BALL_R * 0.5 && p[2] < 642.775 - BALL_R * 0.5;
    if (Math.abs(p[1]) > 5120 - BALL_R && !inMouth) (p[1] = Math.sign(p[1]) * (5120 - BALL_R)), (v[1] = -v[1] * 0.6);
    if (Math.abs(p[1]) > 6000 - BALL_R) (p[1] = Math.sign(p[1]) * (6000 - BALL_R)), (v[1] = -v[1] * 0.3);
    cornerBounce(p, v, BALL_R, 0.6);
    const s = len(v);
    if (s > 6000) for (let i = 0; i < 3; i++) v[i] *= 6000 / s;
}

// Sphere vs. the car's oriented hitbox, plus Psyonix's extra "hit" impulse.
function collide(g, c, i) {
    const center = [0, 1, 2].map((k) => c.pos[k] + c.f[k] * HOFF[0] + c.u[k] * HOFF[2]);
    const d0 = sub(g.ball.pos, center);
    const q = [clamp(dot(d0, c.f), -HB[0], HB[0]), clamp(dot(d0, c.r), -HB[1], HB[1]), clamp(dot(d0, c.u), -HB[2], HB[2])];
    const closest = [0, 1, 2].map((k) => center[k] + c.f[k] * q[0] + c.r[k] * q[1] + c.u[k] * q[2]);
    const d = sub(g.ball.pos, closest);
    const dist = len(d);
    if (dist >= BALL_R || dist < 1e-6) return false;
    const n = d.map((v) => v / dist);
    g.ball.pos = axpy(BALL_R, n, closest);
    const rel = dot(sub(c.vel, g.ball.vel), n);
    if (rel > 0) g.ball.vel = axpy(rel, n, g.ball.vel);
    if (g.t - g.lastHit[i] > 0.1) {
        const s = Math.min(len(sub(c.vel, g.ball.vel)), 4600);
        let dir = sub(g.ball.pos, c.pos);
        dir[2] *= 0.35;
        dir = axpy(-0.35 * dot(dir, c.f), c.f, dir);
        const dl = len(dir) || 1;
        g.ball.vel = axpy((s * interp(s, [0, 500, 2300, 4600], [0.65, 0.65, 0.55, 0.3])) / dl, dir, g.ball.vel);
        g.lastHit[i] = g.t;
        g.touches++;
    }
    return true;
}

// Orange sees the field rotated 180° about z, as RLGym's InvertPhys does.
const inv = (v) => [-v[0], -v[1], v[2]];
const local = (c, v) => [dot(c.f, v), dot(c.r, v), dot(c.u, v)];

// BetterObs, in order: AdvancedObs (ball, last action, pads, self, opponent),
// then seven ball-path samples relative to both cars.
function buildObs(g, i, out) {
    const flip = i === 1;
    const view = (c) => {
        const v = flip
            ? { pos: inv(c.pos), vel: inv(c.vel), f: inv(c.f), r: inv(c.r), u: inv(c.u) }
            : { pos: c.pos, vel: c.vel, f: c.f, r: c.r, u: c.u };
        const wl = c.w;
        v.wWorld = [-wl[0] * v.f[0] + wl[1] * v.r[0] + wl[2] * v.u[0], -wl[0] * v.f[1] + wl[1] * v.r[1] + wl[2] * v.u[1], -wl[0] * v.f[2] + wl[1] * v.r[2] + wl[2] * v.u[2]];
        return v;
    };
    const me = view(g.cars[i]);
    const op = view(g.cars[1 - i]);
    const bp = flip ? inv(g.ball.pos) : g.ball.pos;
    const bv = flip ? inv(g.ball.vel) : g.ball.vel;
    const bw = bp[2] < 100 ? [bv[1] / BALL_R, -bv[0] / BALL_R, 0] : [0, 0, 0];
    let k = 0;
    const push = (arr, s = 1) => {
        for (const v of arr) out[k++] = v * s;
    };
    push(bp, POS);
    push(bv, VEL);
    push(bw, ANG);
    push(g.cars[i].prev);
    for (let p = 0; p < 34; p++) {
        const idx = flip ? 33 - p : p;
        out[k++] = g.padT[idx] <= 0 ? 1 : 1 / (1 + g.padT[idx]);
    }
    for (const [c, raw] of [
        [me, g.cars[i]],
        [op, g.cars[1 - i]],
    ]) {
        push(c.pos, POS);
        push(c.f);
        push(c.u);
        push(c.vel, VEL);
        push(c.wWorld, ANG);
        push(local(c, c.wWorld), ANG);
        push(local(c, sub(bp, c.pos)), POS);
        push(local(c, sub(bv, c.vel)), VEL);
        push([raw.boost / 100, raw.ground ? 1 : 0, hasFlip(raw) ? 1 : 0, 0, raw.jumped ? 1 : 0]);
    }
    for (let s = 0; s < PRED_TICKS.length; s++) {
        let pp = g.pred[s].slice(0, 3);
        let pv = g.pred[s].slice(3);
        if (flip) (pp = inv(pp)), (pv = inv(pv));
        push(local(me, sub(pp, me.pos)), POS);
        push(local(me, sub(pv, me.vel)), VEL);
        push(local(me, sub(pp, op.pos)), POS);
        push(local(me, sub(pv, op.vel)), VEL);
    }
    return out;
}

function predictBall(g) {
    const b = { pos: g.ball.pos.slice(), vel: g.ball.vel.slice() };
    let s = 0;
    for (let t = 0; t <= PRED_TICKS[PRED_TICKS.length - 1]; t++) {
        stepBall(b);
        if (t === PRED_TICKS[s]) g.pred[s++] = [...b.pos, ...b.vel];
    }
}

function newGame() {
    const g = {
        cars: [makeCar(0), makeCar(1)],
        ball: null,
        padT: new Float32Array(34),
        pred: [],
        score: [0, 0],
        touches: 0,
        t: 0,
        lastHit: [-1, -1],
        since: 0,
        goal: 0,
        ticks: 0,
        actions: [ACTIONS[0], ACTIONS[0]],
    };
    resetGame(g);
    return g;
}

function resetGame(g) {
    const spot = Math.floor(Math.random() * KICKOFFS.length);
    for (const c of g.cars) kickoffCar(c, spot);
    g.ball = { pos: [0, 0, BALL_R], vel: [0, 0, 0] };
    g.padT.fill(0);
    g.since = 0;
    g.goal = 0;
    g.trail = [];
}

// ---------------------------------------------------------------------------
// Figure
// ---------------------------------------------------------------------------

export default function babybot() {
    let net = null;
    let failed = false;
    const g = newGame();
    const obs = new Float32Array(193);
    const obsShown = new Float32Array(193);
    let probs = new Float32Array(90);
    let chosen = 0;
    let shown = null; // per-layer activations, eased toward the latest decision
    let layerMax = null;
    let links = [];
    let ms = 0;
    let acc = 0;
    let frameDt = 1 / 60;

    const ready = loadNet().then(
        (n) => {
            net = n;
            shown = net.slice(0, -1).map((L) => new Float32Array(L.rows));
            layerMax = net.slice(0, -1).map(() => 1);
        },
        () => {
            failed = true;
        },
    );

    // Blue's decision is the one drawn, so it runs last and its activations stay in the layers.
    function decide() {
        predictBall(g);
        const t0 = performance.now();
        for (const i of [1, 0]) {
            const logits = forward(net, buildObs(g, i, obs));
            let best = 0;
            for (let a = 1; a < 90; a++) if (logits[a] > logits[best]) best = a;
            g.actions[i] = ACTIONS[best];
            g.cars[i].prev = ACTIONS[best].slice();
            if (i === 0) {
                chosen = best;
                let sum = 0;
                for (let a = 0; a < 90; a++) sum += (probs[a] = Math.exp(logits[a] - logits[best]));
                for (let a = 0; a < 90; a++) probs[a] /= sum;
            }
        }
        ms = ms ? ms * 0.9 + (performance.now() - t0) * 0.05 : (performance.now() - t0) / 2;
        traceLinks();
    }

    // For the most active neurons in each layer, find the inputs that pushed hardest on them:
    // the strongest one for each of the top five hidden neurons, the top three for the action.
    function traceLinks() {
        links = [];
        let inp = obs;
        net.forEach((L, k) => {
            const out = L.out;
            const last = k === net.length - 1;
            const picks = last ? [chosen] : [...out.keys()].sort((a, b) => out[b] - out[a]).slice(0, 5);
            for (const i of picks) {
                const contrib = [...inp.keys()].map((j) => [j, L.w[i * L.cols + j] * inp[j]]);
                contrib.sort((a, b) => b[1] - a[1]);
                for (const [j, c] of contrib.slice(0, last ? 3 : 1)) links.push({ layer: k, from: j, to: i, strength: c });
            }
            inp = out;
        });
    }

    function tick() {
        if (g.goal) {
            g.goal += DT;
            if (g.goal > 1.2) resetGame(g);
            return;
        }
        if (g.ticks % TICK_SKIP === 0) decide();
        g.ticks++;
        stepCar(g.cars[0], g.actions[0]);
        stepCar(g.cars[1], g.actions[1]);
        stepBall(g.ball);
        g.t += DT;
        const blueHit = collide(g, g.cars[0], 0);
        const orangeHit = collide(g, g.cars[1], 1);
        if (blueHit || orangeHit) g.since = 0;
        for (const c of g.cars) {
            if (c.pos[2] > 200) continue;
            PADS.forEach(([x, y, big], k) => {
                if (g.padT[k] > 0 || Math.hypot(x - c.pos[0], y - c.pos[1]) > (big ? 208 : 144)) return;
                c.boost = Math.min(100, c.boost + (big ? 100 : 12));
                g.padT[k] = big ? 10 : 4;
            });
        }
        for (let k = 0; k < 34; k++) g.padT[k] = Math.max(0, g.padT[k] - DT);
        g.since += DT;
        if (g.ticks % 4 === 0) {
            g.trail.push(g.ball.pos.slice(0, 2));
            if (g.trail.length > 40) g.trail.shift();
        }
        if (Math.abs(g.ball.pos[1]) > 5120 + BALL_R) {
            g.score[g.ball.pos[1] > 0 ? 0 : 1]++;
            g.goal = DT;
            g.scorer = g.ball.pos[1] > 0 ? 0 : 1;
        } else if (g.since > 15) resetGame(g);
    }

    function layout(w, h) {
        const top = 30;
        const bottom = w > 520 ? 40 : 30;
        const fieldW = Math.min(0.8 * (h - top - 14), 0.42 * w);
        const fieldH = fieldW / 0.8;
        const field = { x: 12, y: top + (h - top - 14 - fieldH) / 2, w: fieldW, h: fieldH };
        const nx = field.x + fieldW + Math.max(16, w * 0.03);
        const areaW = w - nx - 12;
        const areaH = h - top - 18 - bottom;
        const gap = clamp(areaW * 0.045, 6, 22);
        // Room for the input-group labels left of the input strip, when cells are big enough to label.
        const labels = areaW > 380 ? 62 : 0;
        const cell = clamp(Math.floor(Math.min(areaH / 65, (areaW - labels - 6 * gap) / 46)), 1, 7);
        const used = labels + 46 * cell + 6 * gap;
        const x0 = nx + labels + Math.max(0, (areaW - used) / 2);
        const y0 = top + 18 + Math.max(0, (areaH - 65 * cell) / 2);
        // Columns: input strip (3 wide), five 8-wide hidden layers, 3-wide action grid.
        const cols = [];
        let x = x0;
        for (const [n, wide, rows] of [
            [193, 3, 65],
            [512, 8, 64],
            [512, 8, 64],
            [512, 8, 64],
            [512, 8, 64],
            [512, 8, 64],
            [90, 3, 30],
        ]) {
            cols.push({ n, wide, rows, x, y: y0 + ((65 - rows) * cell) / 2 });
            x += wide * cell + gap;
        }
        return { field, cols, cell, top, bottom };
    }

    const cellXY = (col, i, cell) => [col.x + (i % col.wide) * cell + cell / 2, col.y + Math.floor(i / col.wide) * cell + cell / 2];

    function drawField(ctx, F, p) {
        const s = F.w / 8192;
        const X = (x) => F.x + F.w / 2 - x * s;
        const Y = (y) => F.y + F.h / 2 - y * s;
        ctx.fillStyle = rgba(p.fg, 0.03);
        ctx.strokeStyle = rgba(p.fg, 0.35);
        ctx.beginPath();
        FIELD_OUTLINE.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = rgba(p.fg, 0.14);
        ctx.beginPath();
        ctx.moveTo(F.x, Y(0));
        ctx.lineTo(F.x + F.w, Y(0));
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(X(0), Y(0), 1000 * s, 0, TAU);
        ctx.stroke();
        // Goals: orange at the top, blue at the bottom.
        ctx.strokeStyle = rgba(p.d, 0.7);
        ctx.strokeRect(X(893), Y(5120) - 880 * s * 0.5, 1786 * s, 880 * s * 0.5);
        ctx.strokeStyle = rgba(p.b, 0.8);
        ctx.strokeRect(X(893), Y(-5120), 1786 * s, 880 * s * 0.5);
        PADS.forEach(([x, y, big], k) => {
            ctx.fillStyle = rgba(p.fg, g.padT[k] > 0 ? 0.08 : big ? 0.5 : 0.25);
            ctx.beginPath();
            ctx.arc(X(x), Y(y), (big ? 2.4 : 1.3) * Math.max(1, F.w / 300), 0, TAU);
            ctx.fill();
        });

        g.trail.forEach(([x, y], i) => {
            ctx.fillStyle = rgba(p.fg, (i / g.trail.length) * 0.25);
            ctx.beginPath();
            ctx.arc(X(x), Y(y), 1.2, 0, TAU);
            ctx.fill();
        });

        g.cars.forEach((c, i) => {
            const col = i === 0 ? p.b : p.d;
            const fx = -c.f[0];
            const fy = -c.f[1];
            ctx.save();
            ctx.translate(X(c.pos[0]), Y(c.pos[1]));
            ctx.transform(fx, fy, -fy, fx, 0, 0);
            const lift = 1 + c.pos[2] / 1500;
            // Drawn about twice life size so the cars read at this scale.
            const L = Math.max(7, 118 * s * 2.2) * lift;
            const Wd = Math.max(5, 84 * s * 2.2) * lift;
            if (c.boosting) {
                ctx.fillStyle = rgba(p.c, 0.8);
                ctx.beginPath();
                ctx.moveTo(-L / 2, -Wd * 0.25);
                ctx.lineTo(-L / 2 - L * (0.5 + Math.random() * 0.4), 0);
                ctx.lineTo(-L / 2, Wd * 0.25);
                ctx.fill();
            }
            ctx.fillStyle = rgba(col, 0.95);
            ctx.beginPath();
            ctx.roundRect(-L / 2, -Wd / 2, L, Wd, Math.min(L, Wd) * 0.25);
            ctx.fill();
            ctx.fillStyle = rgba(p.bg, 0.7);
            ctx.fillRect(L * 0.05, -Wd * 0.32, L * 0.18, Wd * 0.64);
            ctx.restore();
            if (i === 0) {
                // The car whose network is drawn on the right.
                ctx.strokeStyle = rgba(p.b, 0.5);
                ctx.beginPath();
                ctx.arc(X(c.pos[0]), Y(c.pos[1]), Math.max(10, 300 * s), 0, TAU);
                ctx.stroke();
            }
        });

        const b = g.ball.pos;
        const br = Math.max(3, BALL_R * s * 1.4 * (1 + b[2] / 1200));
        ctx.fillStyle = rgba(p.fg, 0.12);
        ctx.beginPath();
        ctx.arc(X(b[0]), Y(b[1]), BALL_R * s * 1.4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = p.fg;
        ctx.beginPath();
        ctx.arc(X(b[0]), Y(b[1]), br, 0, TAU);
        ctx.fill();

        if (g.goal) {
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            mono(ctx, Math.max(12, F.w * 0.07), rgba(g.scorer === 0 ? p.b : p.d, Math.min(1, g.goal * 4)), 600);
            ctx.fillText("goal", F.x + F.w / 2, F.y + F.h / 2);
            ctx.textAlign = "left";
        }
    }

    function drawNet(ctx, Lo, w, h, p, dt) {
        const { cols, cell } = Lo;
        const ease = Math.min(1, dt * 12);
        for (let i = 0; i < 193; i++) obsShown[i] += (obs[i] - obsShown[i]) * ease;
        shown.forEach((arr, k) => {
            const out = net[k].out;
            let m = 1e-6;
            for (let i = 0; i < arr.length; i++) {
                arr[i] += (out[i] - arr[i]) * ease;
                if (arr[i] > m) m = arr[i];
            }
            layerMax[k] += (m - layerMax[k]) * ease;
        });

        // Links first, so cells sit on top of them.
        const colOf = (layer) => cols[layer];
        const maxS = Math.max(1e-6, ...links.map((l) => l.strength));
        ctx.lineWidth = 1;
        for (const l of links) {
            const [x1, y1] = cellXY(colOf(l.layer), l.from, cell);
            const [x2, y2] = cellXY(colOf(l.layer + 1), l.to, cell);
            const t = clamp(l.strength / maxS, 0, 1);
            ctx.strokeStyle = ramp(p, (l.layer + 1) / 6, 0.12 + t * 0.5);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.bezierCurveTo((x1 + x2) / 2, y1, (x1 + x2) / 2, y2, x2, y2);
            ctx.stroke();
        }

        const sz = Math.max(1, cell - (cell > 2 ? 1 : 0));
        // Inputs: brightness is |value|.
        for (let i = 0; i < 193; i++) {
            const [x, y] = cellXY(cols[0], i, cell);
            ctx.fillStyle = rgba(p.fg, 0.07 + Math.min(1, Math.abs(obsShown[i])) * 0.8);
            ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        }
        // Hidden layers: brightness is the ReLU output relative to the layer's peak.
        shown.forEach((arr, k) => {
            const col = cols[k + 1];
            for (let i = 0; i < arr.length; i++) {
                const t = Math.min(1, arr[i] / layerMax[k]);
                const [x, y] = cellXY(col, i, cell);
                ctx.fillStyle = t > 0.02 ? ramp(p, k / 5, 0.12 + t * 0.88) : rgba(p.fg, 0.05);
                ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
            }
        });
        // Actions: brightness is probability, the chosen one is boxed.
        const out = cols[6];
        let pmax = 0;
        for (let a = 0; a < 90; a++) pmax = Math.max(pmax, probs[a]);
        for (let a = 0; a < 90; a++) {
            const [x, y] = cellXY(out, a, cell);
            ctx.fillStyle = rgba(p.c, 0.06 + Math.sqrt(probs[a] / (pmax || 1)) * 0.9);
            ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        }
        const [cx, cy] = cellXY(out, chosen, cell);
        ctx.strokeStyle = rgba(p.fg, 0.9);
        ctx.strokeRect(cx - cell / 2 - 1.5, cy - cell / 2 - 1.5, cell + 3, cell + 3);

        // Labels.
        if (cell >= 3) {
            mono(ctx, 10, rgba(p.fg, 0.45));
            ctx.textBaseline = "bottom";
            const labelY = cols[1].y - 6;
            ctx.fillText("obs", cols[0].x, labelY);
            ctx.fillText("shared trunk", cols[1].x, labelY);
            ctx.fillText("policy head", cols[3].x, labelY);
            ctx.fillText("π", out.x, out.y - 6);
            if (cell >= 5 && cols[0].x - Lo.field.x - Lo.field.w > 60) {
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";
                let start = 0;
                for (const [name, n] of OBS_GROUPS) {
                    const r0 = Math.floor(start / 3);
                    const r1 = Math.floor((start + n - 1) / 3);
                    mono(ctx, 9, rgba(p.fg, 0.35));
                    if (r1 - r0 >= 2 || n >= 8) ctx.fillText(name, cols[0].x - 5, cols[0].y + ((r0 + r1 + 1) / 2) * cell);
                    start += n;
                }
                ctx.textAlign = "left";
            }
        }
        // The decision, decoded.
        const tx = cols[1].x;
        const ty = h - Lo.bottom + 6;
        ctx.textBaseline = "top";
        mono(ctx, w > 520 ? 12 : 10, rgba(p.fg, 0.85), 500);
        ctx.fillText(describe(ACTIONS[chosen]), tx, ty);
        if (w > 520) {
            mono(ctx, 10, rgba(p.fg, 0.45));
            ctx.fillText(`action ${chosen} of 90 · p ${probs[chosen].toFixed(2)}`, tx, ty + 17);
        }
    }

    return {
        ready,
        step(dt, w, h) {
            if (!net) return;
            acc += Math.min(dt, 0.05);
            while (acc >= DT) {
                acc -= DT;
                tick();
            }
            frameDt = dt || frameDt;
        },
        draw(ctx, w, h, p) {
            const Lo = layout(w, h);
            drawField(ctx, Lo.field, p);
            ctx.textBaseline = "top";
            mono(ctx, 11, rgba(p.fg, 0.55));
            if (!net) {
                ctx.fillText(failed ? "couldn't load the network weights" : "loading network weights · 2.4 MB", Lo.cols[1].x, 8);
                return;
            }
            ctx.fillStyle = rgba(p.b, 0.9);
            ctx.fillText(`blue ${g.score[0]}`, 14, 8);
            ctx.fillStyle = rgba(p.fg, 0.4);
            ctx.fillText("–", 14 + ctx.measureText(`blue ${g.score[0]} `).width, 8);
            ctx.fillStyle = rgba(p.d, 0.9);
            ctx.fillText(`${g.score[1]} orange`, 14 + ctx.measureText(`blue ${g.score[0]} – `).width, 8);
            if (w > 520) {
                ctx.textAlign = "right";
                mono(ctx, 11, rgba(p.fg, 0.45));
                ctx.fillText(`forward pass ${ms.toFixed(1)} ms · 15 Hz · both cars`, w - 14, 8);
                ctx.textAlign = "left";
            }
            drawNet(ctx, Lo, w, h, p, frameDt);
        },
    };
}
