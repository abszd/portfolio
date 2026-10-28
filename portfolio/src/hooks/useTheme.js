import { useCallback, useEffect, useLayoutEffect, useState } from "react";

const query = "(prefers-color-scheme: light)";

function systemTheme() {
    return window.matchMedia?.(query).matches ? "light" : "dark";
}

function savedTheme() {
    try {
        return localStorage.getItem("theme");
    } catch {
        return null;
    }
}

// Light/dark theme: follows the OS until the visitor picks one, then remembers it.
export function useTheme() {
    const [theme, setTheme] = useState(() => savedTheme() || systemTheme());

    // Layout effect so the attribute is set before children's effects read CSS variables.
    useLayoutEffect(() => {
        document.documentElement.dataset.theme = theme;
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f3f2ee" : "#07070b");
        // Canvas figures read colours from CSS variables, so tell them to refresh.
        window.dispatchEvent(new Event("themechange"));
    }, [theme]);

    useEffect(() => {
        const mq = window.matchMedia?.(query);
        if (!mq) return;
        const onChange = () => !savedTheme() && setTheme(systemTheme());
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);

    const toggle = useCallback(() => {
        setTheme((t) => {
            const next = t === "dark" ? "light" : "dark";
            try {
                localStorage.setItem("theme", next);
            } catch {
                // Storage can be unavailable (private mode); the toggle still works for this visit.
            }
            return next;
        });
    }, []);

    return [theme, toggle];
}
