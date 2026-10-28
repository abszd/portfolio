import { useEffect, useState } from "react";

const query = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion() {
    return window.matchMedia?.(query).matches ?? false;
}

export function useReducedMotion() {
    const [reduced, setReduced] = useState(prefersReducedMotion);
    useEffect(() => {
        const mq = window.matchMedia?.(query);
        if (!mq) return;
        const onChange = () => setReduced(mq.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    return reduced;
}
