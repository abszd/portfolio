import babybot from "./babybot.js";
import captions from "./captions.js";
import chunks from "./chunks.js";
import clock from "./clock.js";
import duel from "./duel.js";
import grades from "./grades.js";
import hnsw from "./hnsw.js";
import robot from "./robot.js";
import watershed from "./watershed.js";

// Each figure is a factory returning { step(dt, w, h), draw(ctx, w, h, palette) }.
export const figures = { babybot, captions, chunks, clock, duel, grades, hnsw, robot, watershed };
