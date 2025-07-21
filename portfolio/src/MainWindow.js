import { useState, useEffect, useMemo } from "react";
import LinkDisc from "./LinkDisc";
import SelectWindow from "./SelectWindow";
import { workExperience, projects } from "./data";

export default function MainWindow({ isMobile }) {
    const [open, setOpen] = useState(null);

    return (
        <main
            role="main"
            aria-label="Main content"
            className="flex justify-center duration-300 h-screen overflow-hidden bg-slate-900 relative"
        >
            <section
                aria-label="Primary content"
                role="region"
                className={`${
                    isMobile ? "w-full" : "w-1/2"
                } min-w-96 bg-slate-800/50 backdrop-blur-xl duration-500 border-r border-slate-600/30 transition-opacity ${
                    isMobile && open ? "opacity-0 pointer-events-none" : "opacity-100 pointer-events-auto"
                }`}
            >
                <div
                    id="left"
                    className="p-4 lg:p-8 pt-24 lg:pt-24 overflow-y-auto h-screen space-y-8 lg:space-y-12 scrollbar-hidden"
                >
                    <section id="about" className="space-y-8 scroll-mt-16 animate-fade-in">
                        <h2 className="text-2xl lg:text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                            Hi, Nice to meet you! I'm Arian Abbaszadeh.
                        </h2>
                        <div className="grid grid-cols-4 grid-rows-3 gap-4 lg:gap-6 h-[350px] lg:h-[450px]">
                            {/* Profile Image TL */}
                            <div className="col-span-2 row-span-2 rounded-2xl lg:rounded-3xl shadow-2xl shadow-slate-800 border border-slate-600/30 overflow-hidden group animate-slide-in-left">
                                <img
                                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    src={`${process.env.PUBLIC_URL}/me.jpeg`}
                                    alt="Arian Abbaszadeh"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                            </div>

                            {/* Skills BR */}
                            <div className="col-span-2 row-span-1 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 backdrop-blur-sm border border-emerald-400/30 rounded-xl lg:rounded-2xl p-4 lg:p-6 overflow-y-auto scrollbar-hidden shadow-xl animate-slide-in-right">
                                <div className="flex flex-wrap gap-1 lg:gap-2 font-medium text-xs lg:text-sm">
                                    <span className="bg-gradient-to-r from-red-400 to-pink-500 text-white px-3 py-1.5 rounded-full shadow-lg">
                                        🎓 Computer Science @ UW Madison
                                    </span>
                                    <span className="bg-gradient-to-r from-green-400 to-emerald-500 text-white px-3 py-1.5 rounded-full shadow-lg">
                                        💻 Software Engineer @ Skyward
                                    </span>
                                    <span className="bg-gradient-to-r from-blue-400 to-cyan-500 text-white px-3 py-1.5 rounded-full shadow-lg">
                                        🏠 Thousand Oaks, CA
                                    </span>
                                    <span className="bg-gradient-to-r from-purple-400 to-pink-500 text-white px-3 py-1.5 rounded-full shadow-lg">
                                        ⚡ Open To Work
                                    </span>
                                </div>
                            </div>

                            {/* Summary Statement TR */}
                            <div className="col-span-2 row-span-2 bg-gradient-to-br from-violet-500/20 to-purple-500/20 backdrop-blur-sm border border-violet-400/30 rounded-xl lg:rounded-2xl p-4 lg:p-6 overflow-y-auto scrollbar-hidden shadow-xl animate-slide-in-up">
                                <h3 className="font-bold text-base lg:text-lg mb-3 text-violet-200">About Me</h3>
                                <p className="text-xs lg:text-sm text-gray-200 leading-relaxed">
                                    I'm a passionate software engineer who loves building things from the ground up. I
                                    enjoy taking on diverse technical challenges. What drives me is the opportunity to
                                    own entire problems, optimize performance, and create solutions that people actually
                                    use. I'm always eager to learn new technologies and collaborate with fellow
                                    engineers who truly care about their craft.
                                </p>
                            </div>

                            {/* Info BL*/}
                            <div className="col-span-2 row-span-1 flex justify-around items-center animate-fade-in-delayed gap-2">
                                <LinkDisc url={"https://github.com/abszd"} type={"github"} />
                                <LinkDisc url={"https://www.linkedin.com/in/arian-abbaszadeh/"} type={"linkedin"} />
                            </div>
                        </div>
                    </section>

                    {/* Experience Section */}
                    <section id="experience" className="space-y-6 animate-fade-in">
                        <h2 className="text-2xl lg:text-4xl font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
                            Experience
                        </h2>
                        {workExperience.map((job, index) => (
                            <div
                                key={job.id}
                                className={`group hover:scale-[1.02] p-4 rounded-2xl cursor-pointer duration-300 transition-all animate-slide-in-up`}
                                style={{ animationDelay: `${index * 100}ms` }}
                                onClick={() => {
                                    setOpen(job);
                                    document.getElementById("right")?.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                            >
                                <div
                                    className={`${
                                        open && job.id === open.id
                                            ? "bg-gradient-to-r from-orange-500/30 to-red-500/30 backdrop-blur-sm border border-orange-400/50 shadow-2xl"
                                            : "bg-slate-700/30 backdrop-blur-sm border border-slate-600/30 hover:border-orange-400/50 hover:bg-slate-700/50 shadow-lg hover:shadow-2xl"
                                    } p-4 lg:p-6 rounded-xl`}
                                >
                                    <h3 className="group-hover:font-bold text-lg lg:text-xl font-semibold duration-200 group-hover:text-orange-300 text-white">
                                        {job.position}
                                    </h3>
                                    <p className="text-gray-300 mt-1 text-sm lg:text-base">
                                        {job.company} • {job.duration}
                                    </p>
                                    <div className="flex gap-1 lg:gap-2 mt-4 flex-wrap">
                                        {job.tech.map((tech) => (
                                            <span
                                                key={tech}
                                                className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-2 lg:px-3 py-1 lg:py-1.5 rounded-full text-xs lg:text-sm font-medium shadow-lg"
                                            >
                                                {tech}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </section>

                    {/* Projects Section */}
                    <section id="projects" className="space-y-6 animate-fade-in">
                        <h2 className="text-2xl lg:text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                            Projects
                        </h2>
                        {projects.map((project, index) => (
                            <div
                                key={project.id}
                                className={`group hover:scale-[1.02] rounded-2xl p-4 cursor-pointer duration-300 transition-all animate-slide-in-up`}
                                style={{ animationDelay: `${index * 100}ms` }}
                                onClick={() => {
                                    setOpen(project);
                                    document.getElementById("right")?.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                            >
                                <div
                                    className={`${
                                        open && project.id === open.id
                                            ? "bg-gradient-to-r from-cyan-500/30 to-blue-500/30 backdrop-blur-sm border border-cyan-400/50 shadow-2xl"
                                            : "bg-slate-700/30 backdrop-blur-sm border border-slate-600/30 hover:border-cyan-400/50 hover:bg-slate-700/50 shadow-lg hover:shadow-2xl"
                                    } p-4 lg:p-6 rounded-xl`}
                                >
                                    <h3 className="group-hover:font-bold text-lg lg:text-xl font-semibold duration-200 group-hover:text-cyan-300 text-white">
                                        {project.title}
                                    </h3>
                                    <p className="mt-2 text-gray-300 text-sm lg:text-base">{project.shortDesc}</p>
                                    <div className="flex gap-1 lg:gap-2 mt-4 flex-wrap">
                                        {project.tech.map((tech, index) => (
                                            <span
                                                key={index}
                                                className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-2 lg:px-3 py-1 lg:py-1.5 rounded-full text-xs lg:text-sm font-medium shadow-lg"
                                            >
                                                {tech}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </section>

                    {/* Contact Section */}
                    <section id="contact" className="space-y-6 animate-fade-in">
                        <h2 className="text-2xl lg:text-4xl font-bold bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent">
                            Contact
                        </h2>
                        <div className="bg-gradient-to-r from-emerald-500/20 to-green-500/20 backdrop-blur-sm border border-emerald-400/30 rounded-xl lg:rounded-2xl p-4 lg:p-6 shadow-xl">
                            <div className="text-emerald-200 font-medium text-base lg:text-lg">
                                abbaszadeharian@gmail.com
                            </div>
                        </div>
                    </section>
                </div>
            </section>

            {/* Desktop Detail View */}
            {!isMobile && (
                <aside
                    aria-label="Detail panel"
                    role="region"
                    className={`${
                        open ? "w-1/2" : "w-0"
                    } duration-500 bg-slate-800/50 backdrop-blur-xl border-l border-slate-600/30 overflow-hidden`}
                >
                    <SelectWindow key={open?.id || "closed"} slide={true} info={open} setOpen={setOpen} />
                </aside>
            )}

            {/* Mobile Detail View - Overlay */}
            {isMobile && open && (
                <aside aria-label="Detail panel" role="region" className="absolute inset-0 z-20 bg-slate-900">
                    <SelectWindow key={open?.id || "closed"} slide={false} info={open} setOpen={setOpen} />
                </aside>
            )}
        </main>
    );
}
