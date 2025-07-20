import { useState, useEffect } from "react";
import { Header } from "./Header.js";
import MainWindow from "./MainWindow.js";

function App() {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            const aspectRatio = window.innerWidth / window.innerHeight;
            const isMobileView = window.innerWidth < 768 || aspectRatio < 0.8;
            setIsMobile(isMobileView);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    return (
        <div className="text-slate-300">
            <Header isMobile={isMobile} />
            <MainWindow isMobile={isMobile} />
        </div>
    );
}

export default App;
