import { useEffect, useRef } from "react";
import { stats } from "../stats.js";

// The generative background: a halftone dot field driven by domain-warped simplex fBm,
// with contour lines traced through the same field, a cursor "lens", and click ripples.
//
// Two passes keep it cheap enough for laptops and phones:
//   1. the noise field is evaluated once per *cell* into a tiny texture;
//   2. the full-screen pass samples that texture to size each dot and,
//      with bilinear filtering, to draw iso-lines of the very same field.

const NOISE = /* glsl */ `
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}
float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * snoise(p); p = p * 2.03 + 17.17; a *= 0.5; }
    return s;
}`;

const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

// Pass 1: one texel per dot cell. r = field value, g = hue.
const FIELD_FRAG = /* glsl */ `#version 300 es
precision highp float;
out vec4 o;
uniform float uTime;
uniform float uCell;
uniform float uRowOffset;
uniform float uScale;
uniform vec2 uMouse;     // in cell units, already offset for scroll
uniform float uMouseOn;
${NOISE}
void main() {
    vec2 id = floor(gl_FragCoord.xy);
    id.y += uRowOffset;
    vec2 p = (id + 0.5) * uScale;
    // The cursor bends the domain like a weak gravity well.
    vec2 toM = (id + 0.5) - uMouse;
    float pull = uMouseOn * exp(-dot(toM, toM) / 90.0);
    p += normalize(toM + 1e-4) * pull * 0.35 * uScale * 10.0;

    float t = uTime;
    vec2 q = vec2(fbm(p + vec2(0.0, t * 0.05)), fbm(p + vec2(5.2, 1.3) - t * 0.04));
    vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 0.03), fbm(p + 3.0 * q + vec2(8.3, 2.8)));
    float v = fbm(p + 2.4 * r);
    float hue = 0.5 + 0.5 * snoise(p * 0.45 + vec2(t * 0.02, -t * 0.015) + q);
    o = vec4(clamp(0.5 + 0.62 * v, 0.0, 1.0), hue, 0.0, 1.0);
}`;

// Pass 2: dots + contours + cursor lens + click ripples.
const DOT_FRAG = /* glsl */ `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uField;
uniform vec2 uFieldSize;
uniform vec2 uRes;
uniform float uCell;
uniform float uShift;    // parallax shift in px
uniform float uRowOffset;
uniform vec2 uMouse;     // px, top-left origin
uniform float uMouseOn;
uniform vec3 uRipple;    // x, y, age (s)
uniform float uDpr;
uniform float uIntensity;
uniform vec3 uBg, uFg, uA, uB, uC;
void main() {
    vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
    vec2 fs = frag + vec2(0.0, uShift);
    vec2 id = floor(fs / uCell);
    vec2 local = fs - (id + 0.5) * uCell;
    vec2 centerScreen = (id + 0.5) * uCell - vec2(0.0, uShift);

    vec2 texel = vec2(id.x, id.y - uRowOffset);
    vec4 f = texelFetch(uField, ivec2(texel), 0);
    float v = smoothstep(0.42, 0.97, f.r);

    // Cursor lens: dots swell under the pointer.
    float d = length(centerScreen - uMouse);
    float R = 150.0 * uDpr;
    float lens = uMouseOn * exp(-(d * d) / (2.0 * R * R));
    v = clamp(v + lens * 0.55, 0.0, 1.0);

    // Click ripple: an expanding ring that briefly inflates the dots it passes.
    float rd = length(centerScreen - uRipple.xy);
    float ring = exp(-pow((rd - uRipple.z * 900.0 * uDpr) / (40.0 * uDpr), 2.0)) * exp(-uRipple.z * 1.6);
    v = clamp(v + ring * 0.7, 0.0, 1.0);

    float radius = uCell * 0.5 * (0.1 + 0.72 * v);
    float aa = 0.9;
    float dotMask = 1.0 - smoothstep(radius - aa, radius + aa, length(local));

    vec3 col = mix(uA, uB, smoothstep(0.15, 0.55, f.g));
    col = mix(col, uC, smoothstep(0.62, 0.95, f.g));
    // Small dots stay neutral; colour only blooms where the field peaks.
    vec3 dotCol = mix(mix(uBg, uFg, 0.55), col, smoothstep(0.05, 0.6, v));

    // Contours of the same field, sampled with bilinear filtering.
    vec2 uv = vec2(fs.x / uCell, fs.y / uCell - uRowOffset) / uFieldSize;
    float cf = texture(uField, uv).r * 9.0;
    float w = fwidth(cf);
    float fc = fract(cf);
    float line = 1.0 - smoothstep(w * 0.6, w * 1.6, min(fc, 1.0 - fc));

    // Faint registration crosses every 8 cells.
    vec2 g = mod(fs + uCell * 4.0, uCell * 8.0) - uCell * 4.0;
    float reg = (step(abs(g.x), 0.5 * uDpr) + step(abs(g.y), 0.5 * uDpr)) * step(max(abs(g.x), abs(g.y)), 5.0 * uDpr);

    vec3 c = uBg;
    c = mix(c, col, line * 0.12 * uIntensity);
    c = mix(c, uFg, clamp(reg, 0.0, 1.0) * 0.18 * uIntensity);
    c = mix(c, dotCol, dotMask * (0.1 + 0.75 * v) * uIntensity);
    o = vec4(c, 1.0);
}`;

function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(s) || "shader compile failed");
    }
    return s;
}

function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link failed");
    const uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
        const name = gl.getActiveUniform(p, i).name;
        uniforms[name] = gl.getUniformLocation(p, name);
    }
    return { p, u: uniforms };
}

function cssColor(name) {
    const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace("#", "");
    const n = parseInt(hex.length === 3 ? hex.replace(/./g, "$&$&") : hex, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export default function Background({ reducedMotion, dim }) {
    const canvasRef = useRef(null);
    const api = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "low-power" });
        if (!gl) {
            document.documentElement.classList.add("no-webgl");
            return;
        }

        let field, dots;
        try {
            field = program(gl, VERT, FIELD_FRAG);
            dots = program(gl, VERT, DOT_FRAG);
        } catch (err) {
            console.warn("Background shader disabled:", err);
            document.documentElement.classList.add("no-webgl");
            return;
        }

        const quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = gl.createFramebuffer();

        const state = {
            w: 0,
            h: 0,
            dpr: 1,
            cell: 14,
            cols: 0,
            rows: 0,
            mouse: [-9999, -9999],
            target: [-9999, -9999],
            mouseOn: 0,
            mouseOnTarget: 0,
            ripple: [-9999, -9999, 99],
            colors: null,
            intensity: 1,
            intensityTarget: 1,
            time: Math.random() * 100,
            raf: 0,
            last: performance.now(),
            frames: 0,
            fpsAt: performance.now(),
            running: true,
        };

        function resize() {
            state.dpr = Math.min(window.devicePixelRatio || 1, 2);
            state.w = Math.floor(window.innerWidth * state.dpr);
            state.h = Math.floor(window.innerHeight * state.dpr);
            canvas.width = state.w;
            canvas.height = state.h;
            const cssCell = window.innerWidth < 640 ? 12 : 15;
            state.cell = Math.round(cssCell * state.dpr);
            state.cols = Math.ceil(state.w / state.cell) + 1;
            state.rows = Math.ceil(state.h / state.cell) + 2;
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, state.cols, state.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }

        function readColors() {
            // Dots read heavier on a light page, so they're toned down there.
            state.gain = document.documentElement.dataset.theme === "light" ? 0.72 : 1;
            state.colors = {
                bg: cssColor("--bg"),
                fg: cssColor("--fg"),
                a: cssColor("--accent-a"),
                b: cssColor("--accent-b"),
                c: cssColor("--accent-c"),
            };
        }

        function render() {
            const { cell, dpr } = state;
            const shift = window.scrollY * 0.35 * dpr;
            const rowOffset = Math.floor(shift / cell);
            const mouseCells = [state.mouse[0] / cell, (state.mouse[1] + shift) / cell - rowOffset];

            // Pass 1: field texture.
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.viewport(0, 0, state.cols, state.rows);
            gl.useProgram(field.p);
            gl.uniform1f(field.u.uTime, state.time);
            gl.uniform1f(field.u.uCell, cell);
            gl.uniform1f(field.u.uRowOffset, rowOffset);
            gl.uniform1f(field.u.uScale, 0.026 * (window.innerWidth < 640 ? 1.25 : 1));
            gl.uniform2f(field.u.uMouse, mouseCells[0], mouseCells[1] + rowOffset);
            gl.uniform1f(field.u.uMouseOn, state.mouseOn);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // Pass 2: screen.
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, state.w, state.h);
            gl.useProgram(dots.p);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.uniform1i(dots.u.uField, 0);
            gl.uniform2f(dots.u.uFieldSize, state.cols, state.rows);
            gl.uniform2f(dots.u.uRes, state.w, state.h);
            gl.uniform1f(dots.u.uCell, cell);
            gl.uniform1f(dots.u.uShift, shift);
            gl.uniform1f(dots.u.uRowOffset, rowOffset);
            gl.uniform2f(dots.u.uMouse, state.mouse[0], state.mouse[1]);
            gl.uniform1f(dots.u.uMouseOn, state.mouseOn);
            gl.uniform3f(dots.u.uRipple, state.ripple[0], state.ripple[1], state.ripple[2]);
            gl.uniform1f(dots.u.uDpr, dpr);
            gl.uniform1f(dots.u.uIntensity, state.intensity * state.gain);
            const { bg, fg, a, b, c } = state.colors;
            gl.uniform3fv(dots.u.uBg, bg);
            gl.uniform3fv(dots.u.uFg, fg);
            gl.uniform3fv(dots.u.uA, a);
            gl.uniform3fv(dots.u.uB, b);
            gl.uniform3fv(dots.u.uC, c);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        function frame(now) {
            const dt = Math.min((now - state.last) / 1000, 0.05);
            state.last = now;
            state.time += dt;
            const k = 1 - Math.exp(-dt * 7);
            state.mouse[0] += (state.target[0] - state.mouse[0]) * k;
            state.mouse[1] += (state.target[1] - state.mouse[1]) * k;
            state.mouseOn += (state.mouseOnTarget - state.mouseOn) * (1 - Math.exp(-dt * 3));
            state.intensity += (state.intensityTarget - state.intensity) * (1 - Math.exp(-dt * 4));
            state.ripple[2] += dt;
            render();

            state.frames++;
            if (now - state.fpsAt > 500) {
                stats.fps = Math.round((state.frames * 1000) / (now - state.fpsAt));
                state.frames = 0;
                state.fpsAt = now;
            }
            stats.time = state.time;
            if (state.running) state.raf = requestAnimationFrame(frame);
        }

        const onMove = (e) => {
            if (e.pointerType === "touch") return;
            state.target = [e.clientX * state.dpr, e.clientY * state.dpr];
            if (state.mouseOnTarget === 0) state.mouse = [...state.target];
            state.mouseOnTarget = 1;
            stats.x = e.clientX / window.innerWidth;
            stats.y = e.clientY / window.innerHeight;
        };
        const onLeave = () => (state.mouseOnTarget = 0);
        const onDown = (e) => {
            state.ripple = [e.clientX * state.dpr, e.clientY * state.dpr, 0];
        };
        const onVisibility = () => {
            const hidden = document.hidden;
            if (hidden && state.running) {
                state.running = false;
                cancelAnimationFrame(state.raf);
            } else if (!hidden && !state.running && !api.current.reduced) {
                state.running = true;
                state.last = performance.now();
                state.raf = requestAnimationFrame(frame);
            }
        };
        const onResize = () => {
            resize();
            if (!state.running) render();
        };
        const onScroll = () => {
            if (!state.running) render();
        };

        api.current = {
            state,
            reduced: false,
            setTheme() {
                readColors();
                if (!state.running) render();
            },
            setDim(d) {
                state.intensityTarget = d;
                if (!state.running) {
                    state.intensity = d;
                    render();
                }
            },
            setReduced(reduced) {
                this.reduced = reduced;
                cancelAnimationFrame(state.raf);
                state.running = !reduced;
                if (reduced) {
                    state.mouseOn = 0;
                    state.mouseOnTarget = 0;
                    state.intensity = state.intensityTarget;
                    render();
                } else {
                    state.last = performance.now();
                    state.raf = requestAnimationFrame(frame);
                }
            },
        };

        resize();
        readColors();
        canvas.classList.add("ready");
        window.addEventListener("resize", onResize);
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("pointerdown", onDown, { passive: true });
        document.documentElement.addEventListener("pointerleave", onLeave);
        document.addEventListener("visibilitychange", onVisibility);
        const onTheme = () => api.current?.setTheme();
        window.addEventListener("themechange", onTheme);
        state.raf = requestAnimationFrame(frame);

        return () => {
            state.running = false;
            cancelAnimationFrame(state.raf);
            window.removeEventListener("resize", onResize);
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerdown", onDown);
            document.documentElement.removeEventListener("pointerleave", onLeave);
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("themechange", onTheme);
            api.current = null;
        };
    }, []);

    useEffect(() => {
        api.current?.setReduced(reducedMotion);
    }, [reducedMotion]);

    useEffect(() => {
        api.current?.setDim(dim);
    }, [dim]);

    return (
        <>
            <canvas ref={canvasRef} className="bg-canvas" aria-hidden="true" />
            <div className="bg-fallback" aria-hidden="true">
                <span />
                <span />
                <span />
            </div>
            <div className="bg-veil" aria-hidden="true" />
        </>
    );
}
