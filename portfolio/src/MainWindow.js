import { useState } from "react";
import LinkDisc from "./LinkDisc";
import SelectWindow from "./SelectWindow";
import { workExperience, projects } from "./data";
export default function MainWindow() {
    const [open, setOpen] = useState(null);

    return (
        <div className="flex justify-center duration-200 h-screen overflow-hidden">
            <div className={`w-1/2 min-w-96 bg-slate-700 duration-300`}>
                <div id="left" className="p-8 pt-24 overflow-y-auto h-screen space-y-12 scrollbar-hidden">
                    <section id="about" className="space-y-6 scroll-mt-16">
                        <h2 className="text-3xl">Hi, Nice to meet you! I'm Arian Abbaszadeh.</h2>
                        <div className="grid grid-cols-4 grid-rows-3 gap-4 h-[400px] text-slate-800">
                            {/* Profile Image TL */}
                            <div className="col-span-2 row-span-2 rounded-3xl shadow-xl shadow-slate-800">
                                <img
                                    className="h-full w-full object-cover border-2 border-slate-800 rounded-xl"
                                    src={`${process.env.PUBLIC_URL}/me.jpeg`}
                                    alt="Arian Abbaszadeh"
                                />
                            </div>

                            {/* Skills BR */}
                            <div className="col-span-2 row-span-1 shadow-xl shadow-slate-800 border-slate-800 border-2 rounded-xl p-4 bg-gradient-to-tr from-orange-300 to-amber-300 overflow-y-auto scrollbar-hidden">
                                <div className="flex flex-wrap gap-1 font-semibold text-xs">
                                    <span className="bg-red-300 p-1 rounded ">🎓 Computer Science @ UW Madison</span>
                                    <span className="bg-green-300 p-1 rounded ">💻 Software Engineer @ Skyward</span>
                                    <span className="bg-purple-300 p-1 rounded ">🏠 Thousand Oaks, CA</span>
                                </div>
                            </div>
                            {/* Summary Statement TR */}
                            <div className="col-span-2 row-span-2 shadow-xl shadow-slate-800 border-slate-800 border-2 rounded-xl p-4 bg-gradient-to-br from-violet-400 to-purple-300 overflow-y-auto scrollbar-hidden">
                                <h3 className="font-semibold">About Me</h3>
                                <p className="text-sm ">
                                    I'm a passionate software engineer who loves building things from the ground up. I
                                    enjoy taking on diverse technical challenges. What drives me is the opportunity to
                                    own entire problems, optimize performance, and create solutions that people actually
                                    use. I'm always eager to learn new technologies and collaborate with fellow
                                    engineers who truly care about their craft.
                                </p>
                            </div>
                            {/* Info BL*/}
                            <div className="col-span-2 row-span-1 flex justify-around items-center">
                                <LinkDisc url={"https://github.com/abszd"} type={"github"} />
                                <LinkDisc url={"https://www.linkedin.com/in/arian-abbaszadeh/"} type={"linkedin"} />
                            </div>
                        </div>
                    </section>

                    {/* Experience Section */}
                    <section id="experience" className="space-y-6">
                        <h2 className="text-3xl">Experience</h2>
                        {workExperience.map((job) => (
                            <div
                                key={job.id}
                                className={`group  hover:scale-[1.03]  rounded-xl  hover:shadow-inner p-4 cursor-pointer duration-200 ${
                                    open && job.id === open.id
                                        ? "bg-gradient-to-tr from-violet-400 to-purple-400 text-slate-100"
                                        : "bg-slate-800 border-violet-400 hover:border-violet-600 border-2"
                                }`}
                                onClick={() => {
                                    setOpen(job);
                                    document.getElementById("right")?.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                            >
                                <h3 className="group-hover:font-extrabold text-xl font-semibold duration-200 group-hover:text-violet-200">
                                    {job.position}
                                </h3>
                                <p className="">
                                    {job.company} • {job.duration}
                                </p>
                                <div className="flex gap-2 mt-2 flex-wrap">
                                    {job.tech.map((tech) => (
                                        <span
                                            key={tech}
                                            className="bg-indigo-500 px-2 py-1 rounded-xl text-sm duration-200"
                                        >
                                            {tech}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </section>

                    {/* Projects Section */}
                    <section id="projects" className="space-y-6">
                        <h2 className="text-3xl">Projects</h2>
                        {projects.map((project) => (
                            <div
                                key={project.id}
                                className={`group  hover:scale-[1.03]  rounded-xl  hover:shadow-inner p-4 cursor-pointer duration-300 ${
                                    open && project.id === open.id
                                        ? "bg-gradient-to-tr from-teal-400 to-cyan-400 text-slate-100"
                                        : "bg-slate-800 border-teal-400 hover:border-teal-600 border-2"
                                }`}
                                onClick={() => setOpen(project)}
                            >
                                <h3 className="group-hover:font-extrabold text-xl font-semibold duration-200 group-hover:text-teal-100">
                                    {project.title}
                                </h3>
                                <p className="mt-2">{project.shortDesc}</p>
                                <div className="flex gap-2 mt-2 flex-wrap">
                                    {project.tech.map((tech, index) => (
                                        <span
                                            key={index}
                                            className="bg-cyan-500 text-slate-100 px-2 py-1 rounded-xl text-sm duration-200"
                                        >
                                            {tech}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </section>

                    {/* Contact Section */}
                    <section id="contact" className="space-y-4">
                        <h2 className="text-3xl">Contact</h2>
                        <div>abbaszadeharian@gmail.com</div>
                    </section>
                </div>
            </div>
            <div className={`${open ? "w-1/2" : "w-0"} duration-300 bg-slate-800`}>
                <SelectWindow info={open} setOpen={setOpen} />
            </div>
        </div>
    );
}
