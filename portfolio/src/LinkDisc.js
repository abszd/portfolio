export default function LinkDisc({ url, type, small = false }) {
    return (
        <img
            className={`cursor-pointer aspect-square shadow-md shadow-slate-800 hover:shadow-lg hover:shadow-slate-800 ${
                small ? `h-16` : "h-28"
            } hover:skew-x-3 hover:skew-y-3 duration-200 rounded-full`}
            src={`/${type}.png`}
            alt={`${type}`}
            onClick={() => window.open(url, "_blank")}
        ></img>
    );
}
