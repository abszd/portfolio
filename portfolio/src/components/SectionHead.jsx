import { useInView } from "../hooks/useInView.js";
import ScrambleText from "./ScrambleText.jsx";

export default function SectionHead({ index, title, note }) {
    const [ref, inView] = useInView();
    return (
        <div ref={ref} className={`section-head ${inView ? "is-in" : ""}`}>
            <span className="section-idx mono">{index}</span>
            <ScrambleText as="h2" className="section-title" text={title} start={inView} duration={700} />
            <span className="section-rule" aria-hidden="true" />
            {note && <span className="section-note mono">{note}</span>}
        </div>
    );
}
