import { TAU, clamp, mono, rand, rgba, ramp } from "./util.js";

// BabyBot: a side-on slice of the attacking half showing how the aerial reward keeps its
// books. While the car is above ramp height and was the last to touch the ball, the distance
// travelled by car and ball piles up; the next touch cashes it in, and landing wipes it.
// Physics runs at 120 Hz and the car (scripted here, not the trained policy) acts every
// 8 ticks, the same tick skip the training run used. Units are Rocket League's (uu).
const TICK = 1 / 120;
const TICK_SKIP = 8;
const G = -650;
const BALL_R = 92.75;
const CAR_L = 118;
const CAR_H = 36;
const RAMP = 256;
const CEIL = 2044;
const WALL = 5120;
const NET = 6000;
const GOAL_H = 642.775;
const GOAL_BACK = { y: NET, z: GOAL_H / 2 };
const BOOST_ACC = 1058;
const BOOST_USE = 33.3;
const JUMP_V = 700;
const CAR_MAX = 2300;
const BALL_MAX = 6000;
const PITCH_RATE = 5.5;
// Weights from the aerial stage of the curriculum.
const WEIGHTS = { dist: 1000, vel: 500, press: 900, prog: 500 };

const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const fwd = (c) => [c.f * Math.cos(c.p), Math.sin(c.p)];
const up = (c) => [-c.f * Math.sin(c.p), Math.cos(c.p)];
const fmt = (n) => Math.round(n).toLocaleString("en-US");

function stepBall(b, dt) {
    b.vz += G * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    if (b.z < BALL_R) {
        b.z = BALL_R;
        if (b.vz < 0) b.vz = b.vz > -120 ? 0 : -b.vz * 0.6;
        b.vy *= Math.pow(0.6, dt);
    }
    if (b.z > CEIL - BALL_R) {
        b.z = CEIL - BALL_R;
        b.vz = -Math.abs(b.vz) * 0.6;
    }
    // Back wall above the goal mouth, then the back of the net.
    if (b.y > WALL - BALL_R && b.z > GOAL_H) {
        b.y = WALL - BALL_R;
        b.vy = -Math.abs(b.vy) * 0.6;
    }
    if (b.y > NET - BALL_R) {
        b.y = NET - BALL_R;
        b.vy = -Math.abs(b.vy) * 0.3;
    }
}

// Where the ball will be over the next three seconds, sampled at 60 Hz.
function predict(b) {
    const q = { ...b };
    const out = [];
    for (let i = 1; i <= 180; i++) {
        stepBall(q, TICK);
        stepBall(q, TICK);
        out.push({ t: i / 60, y: q.y, z: q.z });
    }
    return out;
}

// The point the car should reach: behind the ball, so the hit pushes it toward goal when
// in range and forward-and-up otherwise, which keeps an air dribble going.
function aimPoint(q) {
    let dy = GOAL_BACK.y - q.y;
    let dz = GOAL_BACK.z - q.z;
    if (dy > 2200) (dy = 1), (dz = 0.55);
    const n = Math.hypot(dy, dz);
    const r = BALL_R + CAR_H * 0.5;
    return { y: q.y - (dy / n) * r, z: q.z - (dz / n) * r };
}

export default function aerial() {
    let W = 0;
    let H = 0;
    let s = 1;
    let left = 0;
    let span = 1;
    let groundY = 0;
    let ball, car, opp, oppTarget, pred, lastTouch, dist, touches, last, prevCar, prevBall;
    let trail, ballTrail, pops, flashes, ticks, acc, clock, sinceTouch, goal, touchedStep, wiped;

    const X = (y) => (y - left) * s;
    const Y = (z) => groundY - z * s;

    function layout(w, h) {
        W = w;
        H = h;
        s = Math.min((h - 44) / CEIL, w / 3800);
        groundY = h - 16;
        span = w / s;
        left = NET + 120 - span;
    }

    function reset() {
        const lo = left + span * 0.2;
        const hi = Math.max(lo + 1, Math.min(WALL - 1500, left + span * 0.5));
        ball = { y: rand(lo, hi), z: rand(250, 650), vy: rand(150, 600), vz: rand(650, 1050) };
        car = {
            y: Math.max(left + 100, ball.y - rand(900, 1500)),
            z: CAR_H / 2,
            vy: rand(800, 1400),
            vz: 0,
            f: 1,
            p: 0,
            pT: 0,
            thr: 1,
            boosting: false,
            boost: 100,
            ground: true,
        };
        opp = { y: WALL - rand(400, 900), z: CAR_H / 2, vy: 0, vz: 0, f: -1, p: 0 };
        oppTarget = opp.y;
        pred = predict(ball);
        lastTouch = null;
        dist = 0;
        touches = 0;
        last = null;
        prevCar = { y: car.y, z: car.z };
        prevBall = { y: ball.y, z: ball.z };
        trail = [];
        ballTrail = [];
        pops = [];
        flashes = [];
        ticks = 0;
        acc = 0;
        clock = 0;
        sinceTouch = 0;
        goal = 0;
        touchedStep = false;
        wiped = 0;
    }

    // Constant-acceleration intercept: the earliest predicted ball position the car can
    // reach with the boost it has, and the acceleration it needs to get there. Intercepts
    // that boost forward are preferred over ones that need the car to turn around.
    function plan(c, tMin) {
        for (const forward of [true, false]) {
            for (const q of pred) {
                if (q.t < tMin) continue;
                const a = aimPoint(q);
                const t = q.t;
                const ay = (2 * (a.y - c.y - c.vy * t)) / (t * t);
                const az = (2 * (a.z - c.z - c.vz * t)) / (t * t) - G;
                const need = Math.hypot(ay, az);
                if (forward && c.f * ay < -0.2 * need) continue;
                if (need < BOOST_ACC * 0.9 && (need / BOOST_ACC) * t * BOOST_USE < c.boost) return { t, ay, az, need, q };
            }
        }
        return null;
    }

    function steer(p) {
        car.pT = Math.atan2(p.az, car.f * p.ay);
        car.thr = clamp(p.need / BOOST_ACC, 0, 1);
        car.boosting = Math.cos(wrap(car.pT - car.p)) > 0.85 && car.boost > 0 && car.thr > 0.05;
    }

    function decide() {
        pred = predict(ball);
        const land = pred.find((q) => q.t > 0.3 && q.z < 400) || pred[pred.length - 1];
        oppTarget = clamp(Math.max(land.y, ball.y) + 650, left + 600, WALL - 250);

        if (!car.ground) {
            const p = plan(car, 0.1);
            if (p) steer(p);
            else (car.boosting = false), (car.thr = 0), (car.pT = 0);
            return;
        }
        // Jump if an aerial intercept is reachable from the top of the jump.
        const p = car.boost > 15 && plan({ ...car, vz: JUMP_V }, 0.3);
        if (p && p.q.z > RAMP + 60 && p.t < 2.4) {
            car.ground = false;
            car.vz = JUMP_V;
            steer(p);
            return;
        }
        // Otherwise drive to get behind where the ball comes down.
        const target = land.y - 350;
        if ((target - car.y) * car.f < -250) car.f = -car.f;
        const gap = Math.abs(target - car.y);
        car.thr = clamp(gap / 800, 0, 1);
        car.boosting = gap > 1400 && car.boost > 30;
    }

    function stepCar(c, dt) {
        if (c.ground) {
            const braking = Math.sign(c.vy) === -c.f;
            c.vy += c.f * c.thr * (braking ? 3500 : 1600 + (c.boosting ? 991 : 0)) * dt;
            if (c.thr === 0 || (!c.boosting && Math.abs(c.vy) > 1410)) c.vy *= Math.pow(0.4, dt);
            if (c.boosting) c.boost = Math.max(0, c.boost - BOOST_USE * dt);
            c.vy = clamp(c.vy, -CAR_MAX, CAR_MAX);
            c.y += c.vy * dt;
            c.z = CAR_H / 2;
            c.vz = 0;
            c.p = 0;
        } else {
            c.vz += G * dt;
            c.p = wrap(c.p + clamp(wrap(c.pT - c.p), -PITCH_RATE * dt, PITCH_RATE * dt));
            if (c.boosting && c.boost > 0) {
                const [fy, fz] = fwd(c);
                c.vy += fy * BOOST_ACC * c.thr * dt;
                c.vz += fz * BOOST_ACC * c.thr * dt;
                c.boost = Math.max(0, c.boost - BOOST_USE * c.thr * dt);
            }
            const sp = Math.hypot(c.vy, c.vz);
            if (sp > CAR_MAX) (c.vy *= CAR_MAX / sp), (c.vz *= CAR_MAX / sp);
            c.y += c.vy * dt;
            c.z += c.vz * dt;
            if (c.z <= CAR_H / 2) {
                // Land on the wheels, facing whichever way the nose ended up.
                if (Math.cos(c.p) < 0) c.f = -c.f;
                c.z = CAR_H / 2;
                c.vz = 0;
                c.p = 0;
                c.ground = true;
                c.boosting = false;
            }
            if (c.z > CEIL - CAR_H / 2) (c.z = CEIL - CAR_H / 2), (c.vz = Math.min(0, c.vz));
        }
        // Bounce off the back wall above the goal instead of sticking to it.
        if (c.z > GOAL_H && c.y > WALL - CAR_L / 2) (c.y = WALL - CAR_L / 2), (c.vy = -Math.abs(c.vy) * 0.3);
        c.y = Math.min(c.y, NET - CAR_L / 2);
    }

    // Defender: holds the ground between the ball's landing spot and its own goal.
    function stepOpp(dt) {
        opp.vy += clamp((oppTarget - opp.y) * 4, -1800, 1800) * dt;
        opp.vy = clamp(opp.vy * Math.pow(0.4, dt), -1300, 1300);
        opp.y = Math.min(opp.y + opp.vy * dt, NET - CAR_L / 2);
    }

    // Oriented box vs. sphere. Any contact is a touch; only a closing car adds impulse.
    function contact(c) {
        const [fy, fz] = fwd(c);
        const [uy, uz] = up(c);
        const ry = ball.y - c.y;
        const rz = ball.z - c.z;
        const lx = clamp(ry * fy + rz * fz, -CAR_L / 2, CAR_L / 2);
        const lz = clamp(ry * uy + rz * uz, -CAR_H / 2, CAR_H / 2);
        const py = c.y + fy * lx + uy * lz;
        const pz = c.z + fz * lx + uz * lz;
        const dy = ball.y - py;
        const dz = ball.z - pz;
        const d = Math.hypot(dy, dz);
        if (d >= BALL_R || d < 1e-6) return false;
        const ny = dy / d;
        const nz = dz / d;
        ball.y = py + ny * BALL_R;
        ball.z = pz + nz * BALL_R;
        const rel = (c.vy - ball.vy) * ny + (c.vz - ball.vz) * nz;
        if (rel > 0) {
            const imp = rel * 1.3 + 250;
            ball.vy += ny * imp;
            ball.vz += nz * imp;
            c.vy -= ny * rel * 0.3;
            c.vz -= nz * rel * 0.3;
            const sp = Math.hypot(ball.vy, ball.vz);
            if (sp > BALL_MAX) (ball.vy *= BALL_MAX / sp), (ball.vz *= BALL_MAX / sp);
            flashes.push({ y: py, z: pz, age: 0 });
        }
        return true;
    }

    // Mirrors AerialStateReward::GetReward, once per decision step.
    function rewardStep() {
        if (lastTouch === "car") {
            if (car.z < RAMP) {
                if (dist > 0) wiped = 0.9;
                dist = 0;
            } else {
                dist += Math.hypot(car.y - prevCar.y, car.z - prevCar.z) + Math.hypot(ball.y - prevBall.y, ball.z - prevBall.z);
            }
        }
        if (touchedStep && dist > 0) {
            const bd = Math.hypot(GOAL_BACK.y - ball.y, GOAL_BACK.z - ball.z);
            const od = Math.hypot(GOAL_BACK.y - opp.y, GOAL_BACK.z - opp.z);
            const vel = (((GOAL_BACK.y - ball.y) / bd) * ball.vy + ((GOAL_BACK.z - ball.z) / bd) * ball.vz) / BALL_MAX;
            const parts = {
                dist: dist / WALL,
                vel,
                press: Math.max(0, (od - bd) / od),
                prog: (car.y + WALL) / (2 * WALL),
            };
            const total = Object.keys(WEIGHTS).reduce((sum, k) => sum + WEIGHTS[k] * parts[k], 0);
            last = { ...parts, total };
            touches++;
            pops.push({ y: ball.y, z: ball.z + BALL_R + 60, text: `+${fmt(total)}`, age: 0 });
            dist = 0;
        }
        touchedStep = false;
        prevCar = { y: car.y, z: car.z };
        prevBall = { y: ball.y, z: ball.z };
    }

    function tick() {
        if (ticks % TICK_SKIP === 0 && !goal) decide();
        ticks++;
        stepCar(car, TICK);
        stepOpp(TICK);
        stepBall(ball, TICK);
        if (!goal && contact(car)) (lastTouch = "car"), (touchedStep = true), (sinceTouch = 0);
        if (!goal && contact(opp)) (lastTouch = "opp"), (sinceTouch = 0);
        if (ticks % TICK_SKIP === 0 && !goal) rewardStep();
        if (ticks % 2 === 0) {
            trail.push([car.y, car.z, lastTouch === "car" && car.z >= RAMP]);
            if (trail.length > 140) trail.shift();
            ballTrail.push([ball.y, ball.z]);
            if (ballTrail.length > 60) ballTrail.shift();
        }
        clock += TICK;
        sinceTouch += TICK;
        if (!goal && ball.y > WALL + BALL_R && ball.z < GOAL_H) goal = TICK;
        if (goal) goal += TICK;
        if (goal > 1.8 || sinceTouch > 6 || ball.y < left - 400 || clock > 12) reset();
    }

    function drawCar(ctx, c, p, solid) {
        const [fy, fz] = fwd(c);
        const [uy, uz] = up(c);
        ctx.save();
        // Local frame in world units: +x is the nose, +y is the roof.
        ctx.transform(fy * s, -fz * s, uy * s, -uz * s, X(c.y), Y(c.z));
        if (solid && c.boosting) {
            const len = 50 + c.thr * 70 + rand(0, 25);
            ctx.fillStyle = rgba(p.c, 0.85);
            ctx.beginPath();
            ctx.moveTo(-CAR_L / 2, -8);
            ctx.lineTo(-CAR_L / 2 - len, -1);
            ctx.lineTo(-CAR_L / 2, 6);
            ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(-CAR_L / 2, -CAR_H / 2);
        ctx.lineTo(CAR_L / 2, -CAR_H / 2);
        ctx.lineTo(CAR_L / 2, -2);
        ctx.lineTo(CAR_L * 0.18, 2);
        ctx.lineTo(-CAR_L * 0.08, CAR_H / 2);
        ctx.lineTo(-CAR_L * 0.42, CAR_H / 2);
        ctx.lineTo(-CAR_L / 2, 0);
        ctx.closePath();
        if (solid) {
            ctx.fillStyle = rgba(p.fg, 0.92);
            ctx.fill();
        } else {
            ctx.lineWidth = 1.2 / s;
            ctx.strokeStyle = rgba(p.fg, 0.5);
            ctx.stroke();
        }
        ctx.restore();
    }

    return {
        step(dt, w, h) {
            if (w !== W || h !== H) {
                layout(w, h);
                if (!ball) reset();
            }
            acc += Math.min(dt, 0.05);
            while (acc >= TICK) {
                acc -= TICK;
                tick();
            }
            for (const f of flashes) f.age += dt;
            flashes = flashes.filter((f) => f.age < 0.5);
            for (const q of pops) q.age += dt;
            pops = pops.filter((q) => q.age < 1.4);
            wiped = Math.max(0, wiped - dt);
        },
        draw(ctx, w, h, p) {
            const roof = Y(CEIL);

            // Grid every 512 uu, with ruler labels along the floor.
            ctx.strokeStyle = rgba(p.fg, 0.045);
            ctx.lineWidth = 1;
            for (let y = Math.ceil(left / 512) * 512; y < left + span; y += 512) {
                ctx.beginPath();
                ctx.moveTo(Math.round(X(y)) + 0.5, roof);
                ctx.lineTo(Math.round(X(y)) + 0.5, groundY);
                ctx.stroke();
            }
            for (let z = 512; z < CEIL; z += 512) {
                ctx.beginPath();
                ctx.moveTo(0, Math.round(Y(z)) + 0.5);
                ctx.lineTo(w, Math.round(Y(z)) + 0.5);
                ctx.stroke();
            }
            mono(ctx, 9, rgba(p.fg, 0.32));
            ctx.textBaseline = "top";
            for (let y = Math.ceil(left / 1024) * 1024; y < WALL; y += 1024) ctx.fillText(`y ${y}`, X(y) + 3, groundY + 3);

            ctx.strokeStyle = rgba(p.fg, 0.16);
            ctx.beginPath();
            ctx.moveTo(0, Math.round(roof) + 0.5);
            ctx.lineTo(w, Math.round(roof) + 0.5);
            ctx.stroke();
            ctx.strokeStyle = rgba(p.fg, 0.55);
            ctx.beginPath();
            ctx.moveTo(0, Math.round(groundY) + 0.5);
            ctx.lineTo(w, Math.round(groundY) + 0.5);
            ctx.stroke();

            // Ramp height: below this line the aerial state resets.
            const rampY = Math.round(Y(RAMP)) + 0.5;
            ctx.setLineDash([4, 5]);
            ctx.strokeStyle = rgba(p.a, 0.55);
            ctx.beginPath();
            ctx.moveTo(0, rampY);
            ctx.lineTo(X(WALL), rampY);
            ctx.stroke();
            ctx.setLineDash([]);
            mono(ctx, 10, rgba(p.a, 0.9));
            ctx.textBaseline = "bottom";
            ctx.fillText("ramp height · 256 uu", 10, rampY - 3);

            // Goal: back wall above the crossbar, posts and netting.
            const gx = X(WALL);
            const nx = X(NET);
            const gy = Y(GOAL_H);
            ctx.save();
            ctx.beginPath();
            ctx.rect(gx, gy, nx - gx, groundY - gy);
            ctx.clip();
            ctx.strokeStyle = rgba(p.fg, 0.1);
            for (let k = -(groundY - gy); k < nx - gx; k += 7) {
                ctx.beginPath();
                ctx.moveTo(gx + k, groundY);
                ctx.lineTo(gx + k + (groundY - gy), gy);
                ctx.stroke();
            }
            ctx.restore();
            ctx.strokeStyle = rgba(p.fg, 0.5);
            ctx.strokeRect(Math.round(gx) + 0.5, Math.round(gy) + 0.5, nx - gx, groundY - gy);
            ctx.lineWidth = 2;
            ctx.strokeStyle = rgba(p.fg, 0.8);
            ctx.beginPath();
            ctx.moveTo(gx, groundY);
            ctx.lineTo(gx, roof);
            ctx.stroke();
            ctx.lineWidth = 1;
            ctx.fillStyle = rgba(p.fg, 0.05);
            ctx.fillRect(gx, roof, w - gx, gy - roof);

            // Ball prediction for the next 1.5 s, the same kind of look-ahead the bot observes.
            ctx.setLineDash([2, 4]);
            ctx.strokeStyle = rgba(p.b, 0.6);
            ctx.beginPath();
            ctx.moveTo(X(ball.y), Y(ball.z));
            for (const q of pred.slice(0, 90)) ctx.lineTo(X(q.y), Y(q.z));
            ctx.stroke();
            ctx.setLineDash([]);

            ballTrail.forEach(([y, z], i) => {
                ctx.fillStyle = rgba(p.fg, (i / ballTrail.length) * 0.2);
                ctx.beginPath();
                ctx.arc(X(y), Y(z), 1.3, 0, TAU);
                ctx.fill();
            });

            // Car trail: lit while the aerial state is accumulating.
            ctx.lineWidth = 2;
            for (let i = 1; i < trail.length; i++) {
                const [y0, z0] = trail[i - 1];
                const [y1, z1, live] = trail[i];
                const t = i / trail.length;
                ctx.strokeStyle = live ? ramp(p, t, 0.35 + t * 0.6) : rgba(p.fg, 0.06 + t * 0.22);
                ctx.beginPath();
                ctx.moveTo(X(y0), Y(z0));
                ctx.lineTo(X(y1), Y(z1));
                ctx.stroke();
            }
            ctx.lineWidth = 1;

            drawCar(ctx, opp, p, false);
            drawCar(ctx, car, p, true);

            const br = BALL_R * s;
            ctx.fillStyle = p.bg;
            ctx.strokeStyle = rgba(p.fg, 0.9);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(X(ball.y), Y(ball.z), br, 0, TAU);
            ctx.fill();
            ctx.stroke();
            ctx.lineWidth = 1;
            ctx.fillStyle = rgba(p.fg, 0.5);
            ctx.beginPath();
            ctx.arc(X(ball.y), Y(ball.z), br * 0.28, 0, TAU);
            ctx.fill();

            for (const f of flashes) {
                const k = f.age / 0.5;
                ctx.strokeStyle = rgba(p.c, 1 - k);
                ctx.beginPath();
                ctx.arc(X(f.y), Y(f.z), 4 + k * 26, 0, TAU);
                ctx.stroke();
            }

            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            for (const q of pops) {
                const k = q.age / 1.4;
                mono(ctx, 12, rgba(p.c, 1 - k * k), 600);
                ctx.fillText(q.text, X(q.y), Y(q.z) - k * 26);
            }
            if (goal) {
                mono(ctx, Math.max(16, w * 0.04), rgba(p.fg, Math.min(1, goal * 3)), 600);
                ctx.textBaseline = "middle";
                ctx.fillText("goal", w * 0.45, Y(CEIL * 0.55));
                mono(ctx, 11, rgba(p.c, Math.min(1, goal * 3)));
                ctx.fillText("+1 × 25,000", w * 0.45, Y(CEIL * 0.55) + Math.max(16, w * 0.04));
            }
            ctx.textAlign = "left";

            // HUD: the running aerial distance, and what the last touch paid.
            ctx.textBaseline = "top";
            const live = lastTouch === "car" && car.z >= RAMP;
            const barW = w > 520 ? 110 : 56;
            mono(ctx, 11, rgba(p.fg, 0.55));
            ctx.fillText("Σd", 14, 8);
            ctx.strokeStyle = rgba(p.fg, 0.35);
            ctx.strokeRect(36.5, 10.5, barW, 8);
            ctx.fillStyle = live ? rgba(p.c, 0.9) : rgba(p.fg, 0.5);
            ctx.fillRect(38, 12, (barW - 3) * clamp(dist / WALL, 0, 1), 5);
            mono(ctx, 11, rgba(p.fg, 0.55));
            ctx.fillText(`${fmt(dist)} uu`, 44 + barW, 8);
            if (w > 600) {
                const status = goal
                    ? "goal"
                    : wiped
                      ? "landed · Σd wiped"
                      : live
                        ? "airborne · accumulating"
                        : lastTouch === "opp"
                          ? "defender touched"
                          : car.ground
                            ? "grounded"
                            : "airborne · no touch yet";
                mono(ctx, 11, wiped ? rgba(p.a, 0.9) : rgba(p.fg, 0.4));
                ctx.fillText(status, 120 + barW, 8);
            }
            ctx.textAlign = "right";
            mono(ctx, 11, rgba(p.fg, 0.55));
            ctx.fillText(`${last ? `last +${fmt(last.total)} · ` : ""}touches ${touches}`, w - 14, 8);
            ctx.textAlign = "left";

            // Breakdown of the last payout into the four gated terms: top right on wide
            // canvases, or in the spare band above the ceiling on narrow ones.
            const wide = w > 520;
            if (last && (wide || roof > 92)) {
                const rows = [
                    ["dist", last.dist],
                    ["vel", last.vel],
                    ["press", last.press],
                    ["prog", last.prog],
                ];
                const x0 = wide ? w - 14 - 168 : 14;
                rows.forEach(([k, v], i) => {
                    const y = 28 + i * 14;
                    mono(ctx, 10, rgba(p.fg, 0.45));
                    ctx.fillText(`${k.padEnd(5)} ×${WEIGHTS[k]}`, x0, y);
                    ctx.fillStyle = rgba(p.fg, 0.12);
                    ctx.fillRect(x0 + 92, y + 3, 50, 5);
                    ctx.fillStyle = ramp(p, i / 3, 0.9);
                    ctx.fillRect(x0 + 92, y + 3, 50 * clamp(v, 0, 1), 5);
                    mono(ctx, 10, rgba(p.fg, 0.55));
                    ctx.fillText(v.toFixed(2), x0 + 146, y);
                });
            }
        },
    };
}
