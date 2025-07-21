import { useCallback } from "react";
import LinkDisc from "./LinkDisc";
import Markdown from "react-markdown";

export default function SelectWindow({ info, setOpen, slide }) {
    const handleBack = useCallback(() => {
        setOpen(null);
    }, [setOpen]);

    const handleBackKey = (e) => {
        if (e.key === "Enter" || e.key === " ") {
            setOpen(null);
        }
    };

    if (!info) {
        return <></>;
    } else {
        return (
            <div
                id="right"
                role="complementary"
                aria-label="Detail panel"
                className={`bg-transparent p-4 lg:p-8 h-screen overflow-y-auto overflow-x-hidden scrollbar-hidden ${
                    slide ? "animate-slide-in-left w-[50vw]" : "animate-fade-in"
                }`}
            >
                <div className="h-20"></div>
                <div className="bg-slate-700/50 backdrop-blur-xl rounded-3xl p-4 lg:p-8 border border-slate-600/30 shadow-2xl">
                    <div className="flex mb-6 gap-4 justify-between items-start flex-col lg:flex-row">
                        <div className="flex items-center gap-4">
                            <div
                                className="flex aspect-square text-2xl bg-slate-600 text-white p-3 hover:cursor-pointer hover:scale-110 duration-300 rounded-2xl items-center justify-center shadow-lg hover:shadow-xl"
                                onClick={handleBack}
                                role="button"
                                tabIndex={0}
                                aria-label="Close detail view"
                                onKeyDown={handleBackKey}
                            >
                                ←
                            </div>
                            <div className="text-2xl lg:text-3xl font-bold text-white">
                                {info.title ? info.title : `${info.position} @ ${info.company}`}
                            </div>
                        </div>
                        {info.links && (
                            <div className="flex gap-4 min-w-16">
                                {info.links.map((link, index) => (
                                    <LinkDisc key={index} url={link.url} type={link.type} small={true} />
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="prose prose-invert max-w-none">
                        <Markdown
                            components={{
                                h2: ({ children }) => (
                                    <h2 className="text-xl lg:text-2xl font-bold mb-6 mt-8 text-slate-200">
                                        {children}
                                    </h2>
                                ),
                                strong: ({ children }) => (
                                    <strong className="font-bold text-slate-200">{children}</strong>
                                ),
                                ul: ({ children }) => (
                                    <ul className="list-disc list-inside mb-6 space-y-2 text-gray-300">{children}</ul>
                                ),
                                li: ({ children }) => (
                                    <li className="mb-2 text-gray-300 leading-relaxed">{children}</li>
                                ),
                                p: ({ children }) => <p className="text-gray-300 leading-relaxed mb-4">{children}</p>,
                            }}
                        >
                            {info.markdown}
                        </Markdown>
                    </div>
                </div>
            </div>
        );
    }
}
