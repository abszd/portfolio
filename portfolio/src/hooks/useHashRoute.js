import { useEffect, useState } from "react";

// Tiny hash router: "#/project/<id>" opens a project page; anything else is the home page.
// Hash routing keeps deep links working on GitHub Pages without a 404 redirect hack.
function parse() {
    const m = window.location.hash.match(/^#\/project\/([\w-]+)/);
    return m ? m[1] : null;
}

function notify() {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function useHashRoute() {
    const [projectId, setProjectId] = useState(parse);

    useEffect(() => {
        const onHash = () => setProjectId(parse());
        window.addEventListener("hashchange", onHash);
        window.addEventListener("popstate", onHash);
        return () => {
            window.removeEventListener("hashchange", onHash);
            window.removeEventListener("popstate", onHash);
        };
    }, []);

    return projectId;
}

// `replace` is used when moving between projects so "back" always returns home.
export function openProject(id, { replace = false } = {}) {
    const url = `#/project/${id}`;
    if (replace) window.history.replaceState({ fromHome: true }, "", url);
    else window.history.pushState({ fromHome: true }, "", url);
    notify();
}

export function closeProject() {
    if (window.history.state?.fromHome) {
        window.history.back();
    } else {
        window.history.pushState(null, "", window.location.pathname + window.location.search);
        notify();
    }
}
