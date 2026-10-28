export const TAU = Math.PI * 2;

export function hexToRgb(hex) {
    let h = hex.trim().replace("#", "");
    if (h.length === 3) h = h.replace(/./g, "$&$&");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
}

// Linear blend between two hex colours, returned as an rgba() string.
export function mix(h1, h2, t, a = 1) {
    const c1 = hexToRgb(h1);
    const c2 = hexToRgb(h2);
    const c = c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

// Three-stop accent ramp (a → b → c).
export function ramp(p, t, a = 1) {
    return t < 0.5 ? mix(p.a, p.b, t * 2, a) : mix(p.b, p.c, (t - 0.5) * 2, a);
}

export const rand = (lo = 0, hi = 1) => lo + Math.random() * (hi - lo);
export const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function mono(ctx, size, color, weight = 400) {
    ctx.font = `${weight} ${size}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillStyle = color;
}

// Small binary max-heap keyed by `priority`, used by the watershed flood.
export class MaxHeap {
    constructor() {
        this.items = [];
    }
    get size() {
        return this.items.length;
    }
    push(item) {
        const a = this.items;
        a.push(item);
        let i = a.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (a[p].priority >= a[i].priority) break;
            [a[p], a[i]] = [a[i], a[p]];
            i = p;
        }
    }
    pop() {
        const a = this.items;
        const top = a[0];
        const last = a.pop();
        if (a.length) {
            a[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1;
                const r = l + 1;
                let m = i;
                if (l < a.length && a[l].priority > a[m].priority) m = l;
                if (r < a.length && a[r].priority > a[m].priority) m = r;
                if (m === i) break;
                [a[m], a[i]] = [a[i], a[m]];
                i = m;
            }
        }
        return top;
    }
}
