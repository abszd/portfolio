import { Suspense, lazy, useEffect, useState } from "react";
import About from "./components/About.jsx";
import Background from "./components/Background.jsx";
import Contact from "./components/Contact.jsx";
import Experience from "./components/Experience.jsx";
import Hero from "./components/Hero.jsx";
import Hud from "./components/Hud.jsx";
import Nav, { SECTIONS } from "./components/Nav.jsx";
import Projects from "./components/Projects.jsx";
import { useHashRoute } from "./hooks/useHashRoute.js";
import { useReducedMotion } from "./hooks/useReducedMotion.js";
import { useTheme } from "./hooks/useTheme.js";

// Project pages pull in the Markdown renderer, so load them on demand.
const ProjectPage = lazy(() => import("./components/ProjectPage.jsx"));

// Reveals every [data-reveal] element the first time it scrolls into view.
function useRevealOnScroll() {
    useEffect(() => {
        const io = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    if (e.isIntersecting) {
                        e.target.classList.add("is-in");
                        io.unobserve(e.target);
                    }
                }
            },
            { rootMargin: "0px 0px -8% 0px" }
        );
        document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
        return () => io.disconnect();
    }, []);
}

// Which section is under the middle of the viewport, plus whether we've left the hero.
function useScrollState() {
    const [active, setActive] = useState(null);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => {
            setScrolled(window.scrollY > window.innerHeight * 0.6);
            const mid = window.innerHeight * 0.45;
            let current = null;
            for (const s of SECTIONS) {
                const el = document.getElementById(s.id);
                if (el && el.getBoundingClientRect().top <= mid) current = s.id;
            }
            setActive(current);
        };
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    }, []);

    return { active, scrolled };
}

export default function App() {
    const [theme, toggleTheme] = useTheme();
    const reducedMotion = useReducedMotion();
    const projectId = useHashRoute();
    const { active, scrolled } = useScrollState();
    useRevealOnScroll();

    const dim = projectId ? 0.35 : scrolled ? 0.5 : 0.9;

    return (
        <>
            <Background reducedMotion={reducedMotion} dim={dim} />
            <a className="skip mono" href="#about">
                skip to content
            </a>
            <Nav active={active} theme={theme} onToggleTheme={toggleTheme} scrolled={scrolled} />
            <main className={projectId ? "is-behind" : ""} inert={projectId ? true : undefined}>
                <Hero reducedMotion={reducedMotion} />
                <About theme={theme} />
                <Experience />
                <Projects reducedMotion={reducedMotion} />
                <Contact />
                <footer className="footer mono">
                    <span>© {new Date().getFullYear()} Arian Abbaszadeh</span>
                    <span>react · vite · one fragment shader · no templates</span>
                </footer>
            </main>
            <Hud active={active} />
            {projectId && (
                <Suspense fallback={null}>
                    <ProjectPage id={projectId} reducedMotion={reducedMotion} />
                </Suspense>
            )}
        </>
    );
}
