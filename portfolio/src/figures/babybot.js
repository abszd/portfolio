import { TAU, clamp, mono, rgba, ramp } from "./util.js";

// BabyBot playing itself, beside its own network. The weights are the trained checkpoint
// (a shared 193 → 512 → 512 trunk into a 512 × 3 policy head with 90 actions), run here in
// JavaScript for both cars. The physics is a compact port of RocketSim, so the play is close
// rather than exact, but every input is built the way BetterObs builds it and every decision
// is the network's own.

const DT = 1 / 120;
const TICK_SKIP = 8;
// GigaLearn's default action delay (tick skip − 1): a decision takes over 7 ticks after the
// observation it was made from.
const ACTION_DELAY = 7;
const BALL_R = 91.25;
const BALL_REST = 93.15;
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
// The arena's corners are cut at 45°: |x| + |y| stays under this.
const CORNER = 8064;
const FIELD_OUTLINE = [
    [2944, 5120], [4096, 3968], [4096, -3968], [2944, -5120],
    [-2944, -5120], [-4096, -3968], [-4096, 3968], [-2944, 5120],
];
// Groups of the 193 inputs, in BetterObs order.
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
// A compact port of RocketSim
// ---------------------------------------------------------------------------
//
// The constants and rules are RocketSim's: throttle, braking and steering curves, tyre grip
// that lets go under powerslide, jumps, double jumps, dodges with flip cancels and z-damping,
// air control and its damping, bumps and demos. The arena's edges are rounded into ramps, and
// cars drive all over it: floor, walls, corners and, briefly, the ceiling.

const GRAVITY = 650;
const MAX_SPEED = 2300;
const TORQUE_SCALE = ((2 * Math.PI) / 65536) * 1000;
const AIR_TORQUE = [130, 95, 400].map((v) => v * TORQUE_SCALE); // pitch, yaw, roll
const AIR_DAMP = [30, 20, 50].map((v) => v * TORQUE_SCALE);
const FLIP_TORQUE = [260, 224]; // rad/s², about the nose (side flips) and the right axis (front and back flips)
const WHEELBASE = 84.87; // Octane, front axle to rear
const REST = 17; // height of a car's origin above whatever it drives on
const CAP_R = 34; // cars collide with each other as capsules of this radius
const RESPAWNS = [
    [-2304, -4608],
    [-2688, -4608],
    [2304, -4608],
    [2688, -4608],
];
const IDLE = [0, 0, 0, 0, 0, 0, 0, 0];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const axpy = (k, a, b) => [b[0] + k * a[0], b[1] + k * a[1], b[2] + k * a[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (k, a) => [k * a[0], k * a[1], k * a[2]];
const unit = (a) => scale(1 / (len(a) || 1), a);
const flat = (v, n) => axpy(-dot(v, n), n, v);
// Rotate v about the unit axis k by angle t (Rodrigues).
function rotate(v, k, t) {
    const c = Math.cos(t);
    const s = Math.sin(t);
    const kv = cross(k, v);
    const d = dot(k, v) * (1 - c);
    return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d];
}

// Rotate v by the turn that takes direction a onto direction b.
function turn(v, a, b) {
    const axis = cross(a, b);
    const s = len(axis);
    return s > 1e-9 ? rotate(v, scale(1 / s, axis), Math.atan2(s, dot(a, b))) : v;
}
const interp = (x, xs, ys) => {
    if (x <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1]);
    return ys[ys.length - 1];
};
const steerAngle = (v) => interp(Math.abs(v), [0, 500, 1000, 1500, 1750, 3000], [0.53356, 0.3193, 0.18203, 0.1057, 0.08507, 0.03454]);
const slideAngle = (v) => interp(Math.abs(v), [0, 2500], [0.39235, 0.1261]);
const throttleAccel = (v) => (Math.abs(v) < 1400 ? 1600 - Math.abs(v) * (1440 / 1400) : Math.max(0, 16 * (1410 - Math.abs(v))));
const bumpGround = (v) => interp(v, [0, 1400, 2200], [0, 1100, 1530]);
const bumpAir = (v) => interp(v, [0, 1400, 2200], [0, 1390, 1945]);
const bumpUp = (v) => interp(v, [0, 1400, 2200], [0, 278, 417]);

// The arena's inside: an octagonal prism (floor, ceiling, side and back walls, cut corners) with
// every edge rounded off by RAMP, the curve that carries a rolling ball or a driving car from
// the floor up a wall. Shrinking the prism by RAMP leaves a core, and the inside is everything
// within RAMP of that core. The back walls are open over the goal mouths, and inside a goal its
// back, sides and crossbar are flat and solid.
const RAMP = 256;
const CORE = [4096 - RAMP, 5120 - RAMP, CORNER - RAMP * Math.SQRT2]; // |x|, |y| and |x| + |y| limits
const GOAL_PLANES = [1, -1].map((s) => [
    { n: [0, -s, 0], d: -6000 },
    { n: [-1, 0, 0], d: -893 },
    { n: [1, 0, 0], d: -893 },
    { n: [0, 0, -1], d: -643 },
]);
const inGoalMouth = (p) => Math.abs(p[0]) < 893 && p[2] < 643;

// The point of the core nearest p. `open` drops the back walls, for a goal mouth.
function nearestCore(p, open) {
    const [L, W, C] = CORE;
    let x = clamp(p[0], -L, L);
    let y = open ? p[1] : clamp(p[1], -W, W);
    if (Math.abs(x) + Math.abs(y) > C) {
        // Onto the cut corner's edge, which runs from (L, C − L) to (C − W, W) in this quadrant.
        const dx = C - W - L;
        const dy = W - C + L;
        const t = clamp(((Math.abs(p[0]) - L) * dx + (Math.abs(p[1]) - C + L) * dy) / (dx * dx + dy * dy), 0, 1);
        x = Math.sign(p[0]) * (L + t * dx);
        y = Math.sign(p[1]) * (C - L + t * dy);
    }
    return [x, y, clamp(p[2], RAMP, 2044 - RAMP)];
}

// Height of p above the arena's surface, and the surface's inward normal under it.
function surfaceAt(p, open) {
    const d = sub(nearestCore(p, open), p);
    const dist = len(d);
    return dist > 1e-6 ? { h: RAMP - dist, n: scale(1 / dist, d) } : { h: RAMP, n: [0, 0, 1] };
}

const hitboxCenter = (c) => [0, 1, 2].map((k) => c.pos[k] + c.f[k] * HOFF[0] + c.u[k] * HOFF[2]);

// Gap between the car's hitbox and a plane, negative when they overlap.
function clearance(c, P) {
    const n = P.n;
    const reach = Math.abs(dot(c.f, n)) * HB[0] + Math.abs(dot(c.r, n)) * HB[1] + Math.abs(dot(c.u, n)) * HB[2];
    return dot(n, hitboxCenter(c)) - P.d - reach;
}

function makeCar(team) {
    return { team, prev: IDLE };
}

function placeCar(c, x, y, yaw) {
    Object.assign(c, {
        pos: [x, y, REST],
        vel: [0, 0, 0],
        f: [Math.cos(yaw), Math.sin(yaw), 0],
        r: [-Math.sin(yaw), Math.cos(yaw), 0],
        u: [0, 0, 1],
        w: [0, 0, 0], // world angular velocity
        boost: 33.3,
        ground: true,
        throttling: false,
        jumped: false,
        jumping: false,
        jumpT: 0,
        sinceJump: 0,
        doubleJumped: false,
        flipped: false,
        flipping: false,
        flipT: 0,
        flipTorque: [0, 0],
        slide: 0, // powerslide amount, ramps up and down like RocketSim's handbrake
        prevJump: 0,
        boosting: false,
        supersonic: false,
        bumpT: 0,
        demoed: 0,
        onFloor: false,
        restT: 0,
        autoFlip: 0,
        autoFlipDir: 1,
    });
}

function kickoffCar(c, spot) {
    let [x, y, yaw] = KICKOFFS[spot];
    if (c.team === 1) (x = -x), (y = -y), (yaw += Math.PI);
    placeCar(c, x, y, yaw);
    c.prev = IDLE;
}

function respawn(c) {
    const [x, y] = RESPAWNS[Math.floor(Math.random() * RESPAWNS.length)];
    const s = c.team === 0 ? 1 : -1;
    placeCar(c, x * s, y * s, (s * Math.PI) / 2);
}

const hasFlip = (c) => c.ground || (!c.flipped && !c.doubleJumped && c.sinceJump < 1.25);

function stepCar(c, a) {
    if (c.demoed > 0) {
        c.demoed -= DT;
        if (c.demoed <= 0) respawn(c);
        return;
    }
    c.boosting = a[6] > 0 && c.boost > 0;
    if (c.boosting) c.boost = Math.max(0, c.boost - 33.3 * DT);
    if (c.ground) drive(c, a);
    else fly(c, a);
    c.prevJump = a[5];
    const sp = len(c.vel);
    if (sp > MAX_SPEED) c.vel = scale(MAX_SPEED / sp, c.vel);
    c.supersonic = sp >= 2200 || (c.supersonic && sp >= 2100);
    c.pos = axpy(DT, c.vel, c.pos);
    touchArena(c);
    c.bumpT = Math.max(0, c.bumpT - DT);
}

// On a surface: throttle, brake and coast along the nose, steering from RocketSim's steer-angle
// curves, and its friction curves for grip: sideways motion bleeds off each tick, far slower
// under powerslide, and a car coasting on a wall barely grips, so it slides down.
function drive(c, a) {
    const [th, st, , , , ju, , hb] = a;
    const n = c.u;
    c.slide = clamp(c.slide + (hb ? 5 : -2) * DT, 0, 1);
    const fs0 = dot(c.vel, c.f);
    let ang = steerAngle(fs0);
    ang += (slideAngle(fs0) - ang) * c.slide;
    const yawRate = (st * fs0 * Math.tan(ang)) / WHEELBASE;
    c.f = rotate(c.f, n, yawRate * DT);
    c.r = cross(n, c.f);
    c.w = scale(yawRate, n);
    // Gravity along the surface: nothing on the floor, a pull downhill on a wall.
    const v = flat(axpy(-GRAVITY * DT, [0, 0, 1], c.vel), n);
    let fs = dot(v, c.f);
    let ls = dot(v, c.r);
    const t = c.boosting ? 1 : th;
    c.throttling = t !== 0;
    const slip = Math.abs(ls) > 5 ? Math.abs(ls) / (Math.abs(ls) + Math.abs(fs)) : 0;
    let lat = 1 - 0.8 * slip;
    let lon = 1;
    if (c.slide) {
        lat *= 1 - 0.9 * c.slide;
        lon = 1 - (0.5 - 0.4 * slip) * c.slide;
    }
    if (!t) {
        const k = interp(n[2], [0, 0.7075, 1], [0.1, 0.5, 1]);
        lat *= k;
        lon *= k;
    }
    let acc;
    if (hb) acc = t * throttleAccel(fs); // no braking while the handbrake is held
    else if (t * fs < -1) acc = -Math.sign(fs) * 3500;
    else if (t) acc = t * throttleAccel(fs);
    else acc = -Math.sign(fs) * Math.min(525, Math.abs(fs) / DT);
    fs += acc * lon * DT;
    if (c.boosting) fs += (2975 / 3) * DT;
    ls *= 1 - 0.16 * lat;
    c.vel = axpy(ls, c.r, scale(fs, c.f));
    if (ju && !c.prevJump) {
        Object.assign(c, { ground: false, jumped: true, jumping: true, jumpT: 0 });
        c.vel = axpy(875 / 3 + 0.62 * (4375 / 3) * DT, n, c.vel);
    }
}

// In the air: the rest of the jump, a double jump or a dodge on a fresh press, then the
// dodge's torque (cancelled by pulling against it) or air control.
function fly(c, a) {
    const [th, , pi, ya, ro, ju] = a;
    if (c.jumping) {
        c.jumpT += DT;
        if (c.jumpT >= 0.2 || (!ju && c.jumpT >= 0.025)) c.jumping = false;
        else c.vel = axpy((c.jumpT < 0.025 ? 0.62 : 1) * (4375 / 3) * DT, c.u, c.vel);
    }
    if (c.jumped && !c.jumping) c.sinceJump += DT;
    const roll = Math.atan2(-c.r[2], c.u[2]);
    if (ju && !c.prevJump && c.onFloor && Math.abs(roll) > 2.8) {
        // RocketSim's auto-flip off the roof.
        c.autoFlip = (0.4 * Math.abs(roll)) / Math.PI;
        c.autoFlipDir = roll > 0 ? 1 : -1;
        c.vel = axpy(-200, c.u, c.vel);
    }
    if (c.autoFlip > 0) {
        c.autoFlip -= DT;
        c.w = axpy(50 * c.autoFlipDir * DT, c.f, c.w);
    } else if (ju && !c.prevJump && hasFlip(c)) {
        if (Math.abs(pi) + Math.abs(ya) + Math.abs(ro) >= 0.5) dodge(c, -pi, ya + ro);
        else (c.vel = axpy(875 / 3, c.u, c.vel)), (c.doubleJumped = true);
    }
    if (c.flipped) c.flipT += DT;
    c.flipping = c.flipping && c.flipT < 0.65;
    if (c.flipping && c.flipT >= 0.15 && (c.vel[2] < 0 || c.flipT < 0.21)) c.vel[2] *= 0.65;

    let air = !(c.autoFlip > 0);
    if (c.flipping) {
        let [tf, tr] = c.flipTorque;
        if (tf || tr) {
            air = false;
            if (tr && pi && Math.sign(tr) === Math.sign(pi)) {
                tr *= 1 - Math.min(Math.abs(pi), 1);
                air = true;
            }
            c.w = axpy(tf * FLIP_TORQUE[0] * DT, c.f, axpy(tr * FLIP_TORQUE[1] * DT, c.r, c.w));
        }
    }
    if (air) {
        // Pitch input does nothing for a moment after a dodge.
        const p = c.flipped && c.flipT < 0.95 ? 0 : pi;
        const pitchAxis = scale(-1, c.r);
        const rollAxis = scale(-1, c.f);
        const torque = axpy(p * AIR_TORQUE[0], pitchAxis, axpy(ya * AIR_TORQUE[1], c.u, scale(ro * AIR_TORQUE[2], rollAxis)));
        const damp = axpy(
            dot(pitchAxis, c.w) * AIR_DAMP[0] * (1 - Math.abs(p)),
            pitchAxis,
            axpy(dot(c.u, c.w) * AIR_DAMP[1] * (1 - Math.abs(ya)), c.u, scale(dot(rollAxis, c.w) * AIR_DAMP[2], rollAxis)),
        );
        c.w = axpy(DT, sub(torque, damp), c.w);
    }
    const spin = len(c.w);
    if (spin > 5.5) c.w = scale(5.5 / spin, c.w);
    if (spin > 1e-6) {
        const k = unit(c.w);
        const t = Math.min(spin, 5.5) * DT;
        const f = unit(rotate(c.f, k, t));
        c.u = unit(flat(rotate(c.u, k, t), f));
        c.f = f;
        c.r = cross(c.u, c.f);
    }
    if (th) c.vel = axpy((200 / 3) * th * DT, c.f, c.vel);
    if (c.boosting) c.vel = axpy((3175 / 3) * DT, c.f, c.vel);
    c.vel[2] -= GRAVITY * DT;
}

// RocketSim's dodge: a sideways or forward impulse that grows with speed, and a torque that
// keeps turning the car for 0.65 s unless the stick pulls against it.
function dodge(c, dx, dy) {
    Object.assign(c, { flipped: true, flipping: true, flipT: 0 });
    let dir = [dx, dy];
    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) dir = [0, 0];
    else dir = dir.map((v) => v / Math.hypot(dx, dy));
    c.flipTorque = [-dir[1], dir[0]];
    const ix = Math.abs(dir[0]) < 0.1 ? 0 : dir[0];
    const iy = Math.abs(dir[1]) < 0.1 ? 0 : dir[1];
    if (!ix && !iy) return;
    const fwd = dot(c.vel, c.f);
    const ratio = Math.abs(fwd) / MAX_SPEED;
    const backwards = Math.abs(fwd) < 100 ? ix < 0 : ix >= 0 !== fwd >= 0;
    let vx = ix * 500 * ((backwards ? 1.5 : 0) * ratio + 1);
    const vy = iy * 500 * (0.9 * ratio + 1);
    if (backwards) vx *= 16 / 15;
    const fh = unit([c.f[0], c.f[1], 0]);
    const rh = [-fh[1], fh[0], 0];
    c.vel = axpy(vy, rh, axpy(vx, fh, c.vel));
}

// Wheels onto the surface: drop the speed into it and square the car up to it.
function land(c, n) {
    const vn = dot(c.vel, n);
    if (vn < 0) c.vel = axpy(-vn, n, c.vel);
    Object.assign(c, { jumped: false, jumping: false, sinceJump: 0, doubleJumped: false, flipped: false, flipping: false, flipT: 0, restT: 0 });
    let f = flat(c.f, n);
    if (len(f) < 0.1) f = cross(flat(c.r, n), n);
    c.f = unit(f);
    c.u = n.slice();
    c.r = cross(c.u, c.f);
    c.ground = true;
}

// Keep a driving car on the curved surface: tip it, and its velocity with it, from its old up to
// the normal under it, so its speed carries round a ramp onto a wall and back down.
function follow(c, n) {
    c.f = turn(c.f, c.u, n);
    c.vel = turn(c.vel, c.u, n);
    c.u = n.slice();
    c.f = unit(flat(c.f, n));
    c.r = cross(c.u, c.f);
    c.vel = flat(c.vel, n);
}

function touchArena(c) {
    const center = hitboxCenter(c);
    const open = inGoalMouth(center);
    const under = surfaceAt(c.pos, open);
    if (c.ground) {
        if (under.h > REST + 40) c.ground = false; // the wall ended under it, over a goal mouth
        else {
            follow(c, under.n);
            c.pos = axpy(REST - under.h, under.n, c.pos);
            // Off an overhang once gravity beats the sticky force: half a g, plus up to another
            // g on steep surfaces while it's driving.
            const n = under.n;
            if (-n[2] > 0.5 + (c.throttling || Math.abs(dot(c.vel, c.f)) > 25 ? 1 - Math.abs(n[2]) : 0)) c.ground = false;
        }
    }
    // The hitbox corner deepest in the surface (the inside is convex, so the box is clear when
    // all eight corners are).
    const box = hitboxCenter(c);
    let deepest = 0;
    let n = null;
    for (const a of [-1, 1])
        for (const b of [-1, 1])
            for (const e of [-1, 1]) {
                const q = axpy(e * HB[2], c.u, axpy(b * HB[1], c.r, axpy(a * HB[0], c.f, box)));
                const s = surfaceAt(q, open);
                if (s.h < deepest) (deepest = s.h), (n = s.n);
            }
    if (!c.ground && dot(c.u, under.n) > 0.6 && (under.h < REST || n) && dot(c.vel, under.n) <= 0) {
        land(c, under.n);
        c.pos = axpy(REST - under.h, under.n, c.pos);
        n = null;
    }
    // Body contact: push out, then bounce and scuff with RocketSim's car-world restitution and
    // friction (both 0.3). A tumbling car keeps rolling until its wheels come round.
    const contacts = n ? [[-deepest, n]] : [];
    // Inside a goal, its walls and crossbar.
    if (open && Math.abs(center[1]) > 5120)
        for (const P of GOAL_PLANES[center[1] > 0 ? 0 : 1]) {
            const gap = clearance(c, P);
            if (gap < 0) contacts.push([-gap, P.n]);
        }
    let onFloor = false;
    for (const [depth, m] of contacts) {
        c.pos = axpy(depth, m, c.pos);
        const vn = dot(c.vel, m);
        if (vn < 0 && c.ground) c.vel = axpy(-vn, m, c.vel);
        else if (vn < 0) {
            const vt = flat(c.vel, m);
            const st = len(vt);
            c.vel = axpy(-0.3 * vn, m, scale(st > 0 ? Math.max(0, 1 - (0.39 * -vn) / st) : 0, vt));
        }
        if (m[2] > 0.7) onFloor = true;
    }
    // Lying on its roof or side: it can auto-flip with a jump, and if it sits there anyway it
    // gets put back on its wheels.
    c.onFloor = !c.ground && onFloor;
    c.restT = c.onFloor ? c.restT + DT : 0;
    if (c.restT > 0.8) {
        land(c, [0, 0, 1]);
        c.pos[2] = REST;
    }
}

function stepBall(b) {
    b.vel[2] -= GRAVITY * DT;
    const drag = 1 - 0.03 * DT;
    for (let k = 0; k < 3; k++) {
        b.vel[k] *= drag;
        b.pos[k] += b.vel[k] * DT;
    }
    const p = b.pos;
    const inMouth = Math.abs(p[0]) < 892.755 - BALL_R * 0.5 && p[2] < 642.775 - BALL_R * 0.5;
    const { h, n } = surfaceAt(p, inMouth);
    const rolling = b.rolling; // on a surface last tick, whose normal was last
    const last = b.n;
    b.rolling = h < BALL_REST + 1;
    b.n = n;
    if (h < BALL_REST) {
        for (let k = 0; k < 3; k++) p[k] += n[k] * (BALL_REST - h);
        // A ball already on a surface turns with it, the way a car does, so its speed carries
        // round the ramps and up the walls. Whatever still drives it into the surface bounces,
        // at the ball's 0.6 restitution, or settles if it's slow.
        if (rolling) b.vel = turn(b.vel, last, n);
        const v = b.vel;
        const vn = dot(v, n);
        const bounce = vn < -60;
        if (vn < 0) for (let k = 0; k < 3; k++) v[k] -= (bounce ? 1.6 : 1) * vn * n[k];
        if (!bounce) for (let k = 0; k < 3; k++) v[k] *= 1 - 0.1 * DT;
        // Spin to match the rolling speed, up to the ball's 6 rad/s cap.
        const w = scale(1 / BALL_R, cross(n, v));
        b.w = scale(Math.min(1, 6 / (len(w) || 1)), w);
    }
    const v = b.vel;
    if (Math.abs(p[1]) > 6000 - BALL_R) (p[1] = Math.sign(p[1]) * (6000 - BALL_R)), (v[1] = -v[1] * 0.3);
    const s = len(v);
    if (s > 6000) for (let i = 0; i < 3; i++) v[i] *= 6000 / s;
}

// Sphere vs. the car's oriented hitbox, plus Psyonix's extra "hit" impulse.
function hitBall(g, c, i) {
    if (c.demoed > 0) return false;
    const center = hitboxCenter(c);
    const d0 = sub(g.ball.pos, center);
    const q = [clamp(dot(d0, c.f), -HB[0], HB[0]), clamp(dot(d0, c.r), -HB[1], HB[1]), clamp(dot(d0, c.u), -HB[2], HB[2])];
    const closest = [0, 1, 2].map((k) => center[k] + c.f[k] * q[0] + c.r[k] * q[1] + c.u[k] * q[2]);
    const d = sub(g.ball.pos, closest);
    const dist = len(d);
    if (dist >= BALL_R || dist < 1e-6) return false;
    const n = d.map((v) => v / dist);
    g.ball.pos = axpy(BALL_R, n, closest);
    // The ball weighs a sixth of the car.
    const rel = dot(sub(c.vel, g.ball.vel), n);
    if (rel > 0) {
        g.ball.vel = axpy((rel * 6) / 7, n, g.ball.vel);
        c.vel = axpy(-rel / 7, n, c.vel);
    }
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

// Closest points between segments p1–q1 and p2–q2 (Ericson, Real-Time Collision Detection 5.1.9).
function closestPoints(p1, q1, p2, q2) {
    const d1 = sub(q1, p1);
    const d2 = sub(q2, p2);
    const r = sub(p1, p2);
    const a = dot(d1, d1);
    const e = dot(d2, d2);
    const f = dot(d2, r);
    const c = dot(d1, r);
    const b = dot(d1, d2);
    const den = a * e - b * b;
    let s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
    let t = (b * s + f) / e;
    if (t < 0) (t = 0), (s = clamp(-c / a, 0, 1));
    else if (t > 1) (t = 1), (s = clamp((b - c) / a, 0, 1));
    return [axpy(s, d1, p1), axpy(t, d2, p2)];
}

function capsule(c) {
    const m = hitboxCenter(c);
    const h = HB[0] - CAP_R;
    return [axpy(-h, c.f, m), axpy(h, c.f, m)];
}

// Car on car: push apart and trade momentum, then RocketSim's bump for whoever led with the
// nose, or a demo if they were supersonic.
function bumpCars(g) {
    const [A, B] = g.cars;
    if (A.demoed > 0 || B.demoed > 0) return;
    const [pa, pb] = closestPoints(...capsule(A), ...capsule(B));
    const d = sub(pb, pa);
    const dist = len(d);
    if (dist >= 2 * CAP_R || dist < 1e-6) return;
    const n = scale(1 / dist, d);
    const push = (2 * CAP_R - dist) / 2;
    A.pos = axpy(-push, n, A.pos);
    B.pos = axpy(push, n, B.pos);
    const closing = dot(sub(A.vel, B.vel), n);
    if (closing <= 0) return;
    A.vel = axpy(-closing * 0.55, n, A.vel);
    B.vel = axpy(closing * 0.55, n, B.vel);
    for (const [X, Y, m] of [
        [A, B, n],
        [B, A, scale(-1, n)],
    ]) {
        if (X.bumpT > 0 || dot(X.f, m) < 0.7) continue;
        const toward = dot(X.vel, m) + closing * 0.55;
        if (toward <= 0) continue;
        X.bumpT = 0.25;
        if (X.supersonic) {
            Y.demoed = 3;
            Y.vel = [0, 0, 0];
            Y.w = [0, 0, 0];
            g.demos++;
            return;
        }
        const up = Y.ground ? Y.u : [0, 0, 1];
        Y.vel = axpy((Y.ground ? bumpGround : bumpAir)(toward), unit(X.vel), axpy(bumpUp(toward), up, Y.vel));
        Y.ground = false;
    }
}

// Orange sees the field rotated 180° about z, as RLGym's InvertPhys does.
const inv = (v) => [-v[0], -v[1], v[2]];
const local = (c, v) => [dot(c.f, v), dot(c.r, v), dot(c.u, v)];

// BetterObs, in order: AdvancedObs (ball, last action, pads, self, opponent),
// then seven ball-path samples relative to both cars.
export function buildObs(g, i, out) {
    const flip = i === 1;
    const view = (c) => (flip ? { pos: inv(c.pos), vel: inv(c.vel), f: inv(c.f), r: inv(c.r), u: inv(c.u), w: inv(c.w) } : c);
    const me = view(g.cars[i]);
    const op = view(g.cars[1 - i]);
    const bp = flip ? inv(g.ball.pos) : g.ball.pos;
    const bv = flip ? inv(g.ball.vel) : g.ball.vel;
    const bw = flip ? inv(g.ball.w) : g.ball.w;
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
        push(c.w, ANG);
        push(local(c, c.w), ANG);
        push(local(c, sub(bp, c.pos)), POS);
        push(local(c, sub(bv, c.vel)), VEL);
        push([raw.boost / 100, raw.ground ? 1 : 0, hasFlip(raw) ? 1 : 0, raw.demoed > 0 ? 1 : 0, raw.jumped ? 1 : 0]);
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
    const b = { ...g.ball, pos: g.ball.pos.slice(), vel: g.ball.vel.slice(), w: g.ball.w.slice() };
    let s = 0;
    for (let t = 0; t <= PRED_TICKS[PRED_TICKS.length - 1]; t++) {
        stepBall(b);
        if (t === PRED_TICKS[s]) g.pred[s++] = [...b.pos, ...b.vel];
    }
}

export function newGame() {
    const g = {
        cars: [makeCar(0), makeCar(1)],
        padT: new Float32Array(34),
        pred: [],
        score: [0, 0],
        touches: 0,
        demos: 0,
        t: 0,
        lastHit: [-1, -1],
    };
    resetGame(g);
    return g;
}

const rand = (a, b) => a + Math.random() * (b - a);
const randomDir = () => unit([rand(-1, 1), rand(-1, 1), rand(-1, 1)]);

function setBall(g, pos, vel, w) {
    g.ball = { pos, vel, w, rolling: pos[2] < BALL_REST + 1, n: [0, 0, 1] };
}

// A car on its wheels at (x, y), facing yaw, moving at vel.
function groundCar(c, x, y, yaw, vel, boost) {
    placeCar(c, x, y, yaw);
    Object.assign(c, { vel: [vel[0], vel[1], 0], boost, prev: IDLE });
}

function kickoffState(g) {
    const spot = Math.floor(Math.random() * KICKOFFS.length);
    for (const c of g.cars) kickoffCar(c, spot);
    setBall(g, [0, 0, BALL_REST], [0, 0, 0], [0, 0, 0]);
}

// RLGymCPP's RandomState: ball and cars anywhere, at any speed and spin. Cars are on their wheels,
// or with allOnGround false each one has even odds of starting in midair at any angle.
function randomState(g, allOnGround) {
    setBall(g, [rand(-3500, 3500), rand(-4000, 4000), rand(BALL_REST, 1820)], scale(rand(0, 4000), randomDir()), [rand(-4, 4), rand(-4, 4), rand(-4, 4)]);
    for (const c of g.cars) {
        const yaw = rand(-Math.PI, Math.PI);
        const vel = scale(rand(0, MAX_SPEED), randomDir());
        groundCar(c, rand(-3500, 3500), rand(-4000, 4000), yaw, vel, rand(0, 100));
        if (allOnGround || Math.random() > 0.5) continue;
        const pitch = rand(-Math.PI / 2, Math.PI / 2);
        c.f = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
        c.r = rotate([-Math.sin(yaw), Math.cos(yaw), 0], c.f, rand(-Math.PI, Math.PI));
        c.u = cross(c.f, c.r);
        c.vel = vel;
        c.pos[2] = rand(150, 1820);
        c.w = scale(5.5, randomDir());
        c.ground = false;
    }
}

// An aerial shot: the ball hanging in the air, one car on the ground behind it with boost to go
// up for it, and the other back in its own half.
function aerialState(g) {
    const s = Math.random() < 0.5 ? 1 : -1; // the shooter attacks +y for blue, -y for orange
    const [shooter, keeper] = s > 0 ? g.cars : [g.cars[1], g.cars[0]];
    const ball = [rand(-2500, 2500), s * rand(-500, 3000), rand(400, 1300)];
    setBall(g, ball, [rand(-400, 400), rand(-400, 400), rand(0, 600)], [rand(-2, 2), rand(-2, 2), rand(-2, 2)]);
    const x = clamp(ball[0] + rand(-800, 800), -3500, 3500);
    const y = clamp(ball[1] - s * rand(1000, 2200), -4500, 4500);
    const yaw = Math.atan2(ball[1] - y, ball[0] - x);
    groundCar(shooter, x, y, yaw, scale(rand(500, 1500), [Math.cos(yaw), Math.sin(yaw), 0]), rand(60, 100));
    const kx = rand(-3000, 3000);
    const ky = s * rand(2000, 4500);
    groundCar(keeper, kx, ky, Math.atan2(ball[1] - ky, ball[0] - kx), scale(rand(0, 1000), randomDir()), rand(0, 100));
}

// Rounds start the way BabyBot's training episodes did: a kickoff a quarter of the time, otherwise
// a random state (all cars on the ground for 10%, some in midair for 50%) or an aerial shot (15%).
function resetGame(g) {
    const pick = Math.random();
    if (pick < 0.25) kickoffState(g);
    else if (pick < 0.35) randomState(g, true);
    else if (pick < 0.85) randomState(g, false);
    else aerialState(g);
    g.padT.fill(0);
    g.since = 0;
    g.goal = 0;
    g.ticks = 0;
    g.trail = [];
    g.actions = [IDLE, IDLE];
    g.next = [IDLE, IDLE];
}

// One 120 Hz tick. Every TICK_SKIP ticks `decide` writes new actions into g.next, and they take
// over ACTION_DELAY ticks later, as in training.
export function tickGame(g, decide) {
    if (g.goal) {
        g.goal += DT;
        if (g.goal > 1.2) resetGame(g);
        return;
    }
    if (g.ticks % TICK_SKIP === 0) {
        predictBall(g);
        decide(g);
    }
    if (g.ticks % TICK_SKIP === ACTION_DELAY) g.actions = g.next.slice();
    g.ticks++;
    g.t += DT;
    g.cars.forEach((c, i) => stepCar(c, g.actions[i]));
    stepBall(g.ball);
    // Alternate who meets the ball first, so a shared touch favours neither side.
    const order = g.ticks % 2 ? [0, 1] : [1, 0];
    const hits = order.map((i) => hitBall(g, g.cars[i], i));
    if (hits[0] || hits[1]) g.since = 0;
    bumpCars(g);
    for (const c of g.cars) {
        if (c.demoed > 0 || c.pos[2] > 200 || c.boost >= 100) continue;
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
    } else if (g.since > 10) resetGame(g); // training's NoTouchCondition(10)
}

// ---------------------------------------------------------------------------
// Figure
// ---------------------------------------------------------------------------

function fillPoly(ctx, pts, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
}

// Convex hull of 2D points (monotone chain).
function hull(pts) {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (list) => {
        const out = [];
        for (const q of list) {
            while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
            out.push(q);
        }
        return out.slice(0, -1);
    };
    return [...half(pts), ...half(pts.slice().reverse())];
}

// The car's hitbox seen from above: about twice life size so it reads at this scale, a little
// bigger the higher it is, and foreshortened on a wall or mid-flip.
function drawCar(ctx, c, col, X, Y, s, p) {
    const k = Math.max(2.2, 7 / (118 * s)) * (1 + c.pos[2] / 1500);
    const m = hitboxCenter(c);
    const at = (a, b, h) => {
        const q = axpy(h * HB[2] * k, c.u, axpy(b * HB[1] * k, c.r, axpy(a * HB[0] * k, c.f, m)));
        return [X(q[0]), Y(q[1])];
    };
    if (c.boosting) {
        const tail = 1 + Math.random() * 0.8;
        fillPoly(ctx, [at(-1, -0.5, 0), at(-1 - tail, 0, 0), at(-1, 0.5, 0)], rgba(p.c, 0.8));
    }
    const corners = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const h of [-1, 1]) corners.push(at(a, b, h));
    fillPoly(ctx, hull(corners), rgba(col, 0.95));
    // Windshield, on the roof toward the nose.
    if (c.u[2] > -0.05) fillPoly(ctx, [at(0.1, -0.64, 1), at(0.46, -0.64, 1), at(0.46, 0.64, 1), at(0.1, 0.64, 1)], rgba(p.bg, 0.7));
}

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
        const t0 = performance.now();
        for (const i of [1, 0]) {
            const logits = forward(net, buildObs(g, i, obs));
            let best = 0;
            for (let a = 1; a < 90; a++) if (logits[a] > logits[best]) best = a;
            g.next[i] = ACTIONS[best];
            g.cars[i].prev = ACTIONS[best];
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
        // Where the floor starts curving up into the walls.
        const [L, W, C] = CORE;
        ctx.strokeStyle = rgba(p.fg, 0.1);
        ctx.beginPath();
        [[C - W, W], [L, C - L], [L, L - C], [C - W, -W], [W - C, -W], [-L, L - C], [-L, C - L], [W - C, W]].forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
        ctx.closePath();
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
            if (c.demoed > 0) {
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                mono(ctx, 12, rgba(col, 0.4 + 0.2 * Math.min(1, c.demoed)), 600);
                ctx.fillText("×", X(c.pos[0]), Y(c.pos[1]));
                ctx.textAlign = "left";
                return;
            }
            drawCar(ctx, c, col, X, Y, s, p);
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
        const ty = h - Lo.bottom + 6;
        ctx.textBaseline = "top";
        mono(ctx, w > 520 ? 12 : 10, rgba(p.fg, 0.85), 500);
        const label = describe(ACTIONS[chosen]);
        const tx = Math.max(14, Math.min(cols[1].x, w - 14 - ctx.measureText(label).width)); // kept on a narrow canvas
        ctx.fillText(label, tx, ty);
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
                tickGame(g, decide);
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
