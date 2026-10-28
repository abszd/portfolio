export const SECTIONS = [
    { id: "about", label: "about" },
    { id: "work", label: "work" },
    { id: "projects", label: "projects" },
    { id: "contact", label: "contact" },
];

export default function Nav({ active, theme, onToggleTheme, scrolled }) {
    const go = (e, id) => {
        e.preventDefault();
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.replaceState(null, "", `#${id}`);
    };

    return (
        <header className={`nav ${scrolled ? "is-scrolled" : ""}`}>
            <a href="#top" className="nav-mark" onClick={(e) => go(e, "top")} aria-label="Back to top">
                <span className="nav-mark-glyph">aa</span>
                <span className="nav-mark-slash">/</span>
            </a>
            <nav aria-label="Sections">
                <ul>
                    {SECTIONS.map((s, i) => (
                        <li key={s.id}>
                            <a href={`#${s.id}`} onClick={(e) => go(e, s.id)} className={active === s.id ? "is-active" : ""}>
                                <span className="nav-idx">0{i + 1}</span>
                                <span className="nav-label">{s.label}</span>
                            </a>
                        </li>
                    ))}
                </ul>
            </nav>
            <button className="theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
                <span className="theme-dot" aria-hidden="true" />
                <span className="theme-label">{theme}</span>
            </button>
        </header>
    );
}
