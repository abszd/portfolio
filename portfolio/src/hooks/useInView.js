import { useEffect, useRef, useState } from "react";

// Flips to true the first time the element scrolls into view (and stays true).
export function useInView(options = { rootMargin: "0px 0px -10% 0px" }) {
    const ref = useRef(null);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el || inView) return;
        const io = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setInView(true);
                io.disconnect();
            }
        }, options);
        io.observe(el);
        return () => io.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inView]);

    return [ref, inView];
}
