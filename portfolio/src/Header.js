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
            className={`z-10 fixed h-20 bg-slate-600 ${
                top ? "bg-opacity-100" : "bg-opacity-20"
            } backdrop-blur-safari w-screen flex p-4 justify-around duration-200`}
        >
            <div className="flex justify-between w-1/2 items-center">
                {sections.map((section) => {
                    return (
                        <span
                            className="text-2xl font-normal hover:text-indigo-300 hover:scale-110 hover:cursor-pointer duration-200 p-1"
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
