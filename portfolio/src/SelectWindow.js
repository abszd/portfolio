import LinkDisc from "./LinkDisc";
import Markdown from "react-markdown";

export default function SelectWindow({ info, setOpen }) {
    if (!info) {
        return <></>;
    } else {
        return (
            <div id="right" className="bg-slate-800 p-8 h-screen overflow-y-auto overflow-x-hidden scrollbar-hidden">
                <div className="h-20"></div>
                <div className="bg-slate-700 rounded-3xl p-6">
                    <div className="flex mb-4 gap-2 justify-between">
                        <div className="flex items-center gap-2 ">
                            <div
                                className="flex aspect-square text-3xl bg-red-500 p-2 px-4 hover:cursor-pointer hover:bg-red-700 duration-200 rounded-full items-center"
                                onClick={() => setOpen(null)}
                            >
                                ←
                            </div>
                            <div className="text-2xl font-semibold">
                                {info.title ? info.title : `${info.position} @ ${info.company}`}
                            </div>
                        </div>
                        {info.links && (
                            <div className="flex gap-4 min-w-16">
                                {info.links.map((link) => (
                                    <LinkDisc url={link.url} type={link.type} small={true} />
                                ))}
                            </div>
                        )}
                    </div>
                    <Markdown
                        components={{
                            h2: ({ children }) => <h2 className="text-xl font-bold mb-4 mt-6">{children}</h2>,
                            strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                            ul: ({ children }) => <ul className="list-disc list-inside mb-4">{children}</ul>,
                            li: ({ children }) => <li className="mb-2">{children}</li>,
                        }}
                    >
                        {info.markdown}
                    </Markdown>
                </div>
            </div>
        );
    }
}
