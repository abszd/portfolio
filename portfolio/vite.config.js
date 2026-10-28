import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://abszd.github.io/portfolio/
export default defineConfig({
    base: "/portfolio/",
    plugins: [react()],
});
