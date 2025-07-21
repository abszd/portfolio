export default function LinkDisc({ url, type, small = false }) {
    const handleKeyDown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
            window.open(url, "_blank");
        }
    };
    return (
        <div className="relative group">
            <div className="absolute inset-0 bg-slate-600 rounded-full blur-lg opacity-0 group-hover:opacity-30 transition-opacity duration-300"></div>
            <img
                className={`relative cursor-pointer aspect-square shadow-xl hover:shadow-2xl ${
                    small
                        ? `h-12 w-12 min-w-12 lg:h-16 lg:w-16 lg:min-w-16`
                        : "min-w-20 h-20 w-20 lg:h-28 lg:w-28 lg:min-w-28 lg:w-24 lg:min-w-24 lg:h-24"
                } hover:scale-110 duration-300 rounded-full border-2 border-slate-600/30 hover:border-slate-500/50 transition-all bg-slate-700/20 backdrop-blur-sm`}
                src={`${process.env.PUBLIC_URL}/${type}.png`}
                alt={`${type.charAt(0).toUpperCase() + type.slice(1)} icon`}
                onClick={() => window.open(url, "_blank")}
                role="link"
                tabIndex={0}
                aria-label={`Open ${type} link`}
                onKeyDown={handleKeyDown}
            />
        </div>
    );
}
