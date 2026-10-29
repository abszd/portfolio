import babybot from "./babybot.js";
import captions from "./captions.js";
import clock from "./clock.js";
import collide from "./collide.js";
import grades from "./grades.js";
import greedy from "./greedy.js";
import hnsw from "./hnsw.js";
import robot from "./robot.js";
import watershed from "./watershed.js";

// Each figure is a factory returning { step(dt, w, h), draw(ctx, w, h, palette) }.
export const figures = { babybot, captions, clock, collide, grades, greedy, hnsw, robot, watershed };
