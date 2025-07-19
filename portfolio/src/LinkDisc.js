export default function LinkDisc({ url, type, small = false }) {
    return (
        <div className="relative group">
            <div className="absolute inset-0 bg-slate-600 rounded-full blur-lg opacity-0 group-hover:opacity-30 transition-opacity duration-300"></div>
            <img
                className={`relative cursor-pointer aspect-square shadow-xl hover:shadow-2xl ${
                    small ? `h-16` : "h-28"
                } hover:scale-110 duration-300 rounded-full border-2 border-slate-600/30 hover:border-slate-500/50 transition-all bg-slate-700/20 backdrop-blur-sm`}
                src={`${process.env.PUBLIC_URL}/${type}.png`}
                alt={`${type}`}
                onClick={() => window.open(url, "_blank")}
            />
        </div>
    );
}
