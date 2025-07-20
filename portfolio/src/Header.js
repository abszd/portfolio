import { useEffect, useState } from "react";

export function Header({ isMobile }) {
    const [top, setTop] = useState(true);
    const [isSelectOpen, setIsSelectOpen] = useState(false);

    useEffect(() => {
        const checkSelectOpen = () => {
            const rightElement = document.getElementById("right");
            setIsSelectOpen(!!rightElement);
        };

        checkSelectOpen();
        
        // Check for select window changes
        const observer = new MutationObserver(checkSelectOpen);
        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        const left = document.getElementById("left");
        if (left) {
            left.addEventListener("scroll", () => setTop(left.scrollTop <= 5));
        }
    }, []);

    const sections = ["About", "Experience", "Projects", "Contact"];

    return (
        <div
            className={`z-30 fixed h-20 ${
                top
                    ? "bg-slate-800/90 backdrop-blur-xl border-b border-slate-400/50"
                    : "bg-slate-800/40 backdrop-blur-md border-b border-slate-600/0"
            } w-screen flex p-2 sm:p-4 justify-center sm:justify-around transition-all duration-500 ${
                isMobile && isSelectOpen ? "opacity-50 pointer-events-none" : ""
            }`}
        >
            <div className="flex justify-between w-full sm:w-1/2 items-center px-2 sm:px-0">
                {sections.map((section) => {
                    return (
                        <span
                            className="text-sm sm:text-xl font-medium hover:text-slate-100 hover:scale-105 hover:cursor-pointer duration-300 p-1 sm:p-2 rounded-lg transition-all text-gray-300 text-center"
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
