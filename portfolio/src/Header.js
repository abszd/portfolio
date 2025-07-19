import { useEffect, useState } from "react";

export function Header() {
    const [top, setTop] = useState(true);

    useEffect(() => {
        const left = document.getElementById("left");
        if (left) {
            left.addEventListener("scroll", () => {
                setTimeout(() => setTop(left.scrollTop <= 5), 200);
            });
        }
    }, []);

    const sections = ["About", "Experience", "Projects", "Contact"];

    return (
        <div
            className={`z-10 fixed h-20 ${
                top
                    ? "bg-slate-800/80 backdrop-blur-xl border-b border-slate-400/50"
                    : "bg-slate-800/40 backdrop-blur-md border-b border-slate-600/0"
            } w-screen flex p-4 justify-around duration-300 transition-all`}
        >
            <div className="flex justify-between w-1/2 items-center">
                {sections.map((section) => {
                    return (
                        <span
                            className="text-xl font-medium hover:text-slate-100 hover:scale-105 hover:cursor-pointer duration-300 p-2 rounded-lg transition-all text-gray-300"
                            onClick={() => {
                                const element = document.getElementById(section.toLowerCase());
                                document
                                    .getElementById("left")
                                    .scrollTo({ top: element.offsetTop - 96, behavior: "smooth" });
                            }}
                            key={section}
                        >
                            {section}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
