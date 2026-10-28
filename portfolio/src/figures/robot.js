import { TAU, mono, rand, rgba, ramp } from "./util.js";

// Radiation robot: samples a noisy field, estimates its gradient from several
// readings, and climbs toward the source while steering around obstacles.
export default function robot() {
    let W = 0;
    let H = 0;
    let src, obstacles, bot, trail, clicks, found, t;

    function field(x, y) {
        const d2 = (x - src.x) ** 2 + (y - src.y) ** 2;
        return 1 / (1 + d2 / 2600);
    }

    function blocked(x, y, pad = 0) {
        if (x < 10 || y < 30 || x > W - 10 || y > H - 34) return true;
        return obstacles.some((o) => x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad);
    }

    function reset(w, h) {
        W = w;
        H = h;
        obstacles = [];
        for (let i = 0; i < 5; i++) obstacles.push({ x: rand(40, w - 100), y: rand(50, h - 100), w: rand(20, 60), h: rand(20, 60) });
        do src = { x: rand(w * 0.55, w - 40), y: rand(50, h - 50) };
        while (blocked(src.x, src.y, 16));
        do bot = { x: rand(20, w * 0.3), y: rand(50, h - 50), heading: rand(0, TAU) };
        while (blocked(bot.x, bot.y, 12));
        trail = [];
        clicks = [];
        found = 0;
        t = 0;
    }

    return {
        step(dt, w, h) {
            if (w !== W || h !== H) reset(w, h);
            t += dt;
            dt = Math.min(dt, 1 / 30);
            const reading = field(bot.x, bot.y);

            // Geiger clicks: a Poisson process whose rate rises with intensity.
            if (Math.random() < dt * (3 + reading * 55)) clicks.push(t);
            clicks = clicks.filter((c) => t - c < 4);

            if (found) {
                found += dt;
                if (found > 2.8) reset(w, h);
                return;
            }

            // Fuse several noisy samples around the robot into a gradient estimate.
            let gx = 0;
            let gy = 0;
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * TAU;
                const s = field(bot.x + Math.cos(a) * 14, bot.y + Math.sin(a) * 14) + rand(-0.02, 0.02);
                gx += Math.cos(a) * s;
                gy += Math.sin(a) * s;
            }
            let want = Math.atan2(gy, gx);
            // Avoid obstacles by checking a short probe ahead and turning away.
            const ahead = (ang) => blocked(bot.x + Math.cos(ang) * 22, bot.y + Math.sin(ang) * 22, 6);
            if (ahead(bot.heading)) {
                const left = !ahead(bot.heading - 0.9);
                want = bot.heading + (left ? -1.4 : 1.4);
            }
            let diff = ((want - bot.heading + Math.PI * 3) % TAU) - Math.PI;
            bot.heading += Math.max(-3 * dt, Math.min(3 * dt, diff)) + rand(-0.4, 0.4) * dt;
            // Slow down and sample more densely as counts rise.
            const speed = 60 * (1 - reading * 0.6);
            const nx = bot.x + Math.cos(bot.heading) * speed * dt;
            const ny = bot.y + Math.sin(bot.heading) * speed * dt;
            if (!blocked(nx, ny, 5)) {
                bot.x = nx;
                bot.y = ny;
            } else {
                bot.heading += 1.2;
            }

            if (!trail.length || Math.hypot(trail[trail.length - 1].x - bot.x, trail[trail.length - 1].y - bot.y) > 7) {
                trail.push({ x: bot.x, y: bot.y, v: reading });
                if (trail.length > 160) trail.shift();
            }
            if (Math.hypot(bot.x - src.x, bot.y - src.y) < 14) found = 0.001;
        },
        draw(ctx, w, h, p) {
            for (const o of obstacles) {
                ctx.fillStyle = rgba(p.fg, 0.1);
                ctx.fillRect(o.x, o.y, o.w, o.h);
                ctx.strokeStyle = rgba(p.fg, 0.35);
                ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
            }

            // Faint iso-rings of the field (what the robot can't see directly).
            for (let r = 1; r <= 5; r++) {
                ctx.strokeStyle = rgba(p.fg, found ? 0.12 : 0.04);
                ctx.beginPath();
                ctx.arc(src.x, src.y, r * 26, 0, TAU);
                ctx.stroke();
            }

            for (const s of trail) {
                ctx.fillStyle = ramp(p, Math.min(1, s.v * 1.3), 0.35 + s.v * 0.6);
                ctx.beginPath();
                ctx.arc(s.x, s.y, 1.8 + s.v * 3, 0, TAU);
                ctx.fill();
            }

            if (found) {
                const k = (found * 1.2) % 1;
                ctx.strokeStyle = rgba(p.c, 1 - k);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(src.x, src.y, 8 + k * 40, 0, TAU);
                ctx.stroke();
                ctx.lineWidth = 1;
                ctx.fillStyle = rgba(p.c, 1);
                ctx.beginPath();
                ctx.arc(src.x, src.y, 4, 0, TAU);
                ctx.fill();
            }

            // Robot.
            ctx.save();
            ctx.translate(bot.x, bot.y);
            ctx.rotate(bot.heading);
            ctx.fillStyle = rgba(p.fg, 0.95);
            ctx.fillRect(-8, -6, 16, 12);
            ctx.fillStyle = rgba(p.a, 1);
            ctx.fillRect(4, -3, 5, 6);
            ctx.restore();

            // Count-rate strip.
            const sy = h - 22;
            ctx.strokeStyle = rgba(p.fg, 0.12);
            ctx.beginPath();
            ctx.moveTo(14, sy + 0.5);
            ctx.lineTo(w - 14, sy + 0.5);
            ctx.stroke();
            ctx.strokeStyle = rgba(p.fg, 0.7);
            for (const c of clicks) {
                const x = w - 14 - ((t - c) / 4) * (w - 28);
                ctx.beginPath();
                ctx.moveTo(x + 0.5, sy - 6);
                ctx.lineTo(x + 0.5, sy + 6);
                ctx.stroke();
            }

            mono(ctx, 11, rgba(p.fg, 0.55));
            ctx.textBaseline = "top";
            ctx.fillText(found ? "source located" : "searching…", 14, 8);
            const cpm = Math.round(clicks.length * 15);
            const label = `${cpm} cpm`;
            ctx.fillStyle = rgba(p.fg, 0.9);
            ctx.fillText(label, w - 14 - ctx.measureText(label).width, 8);
        },
    };
}
