// All of the site's copy lives here. Project write-ups are Markdown so they're
// easy to edit without touching any components.

export const profile = {
    name: "Arian Abbaszadeh",
    role: "Software Engineer",
    tagline: "I build things from the metal up: voxel engines, vector databases, and the tools people actually use.",
    email: "abbaszadeharian@gmail.com",
    links: [
        { label: "github", url: "https://github.com/abszd" },
        { label: "linkedin", url: "https://www.linkedin.com/in/arian-abbaszadeh/" },
    ],
    facts: [
        ["now", "Software Engineer @ Skyward"],
        ["studied", "B.S. Computer Science, UW–Madison '25"],
        ["into", "engines · storage · graphics · RL"],
        ["status", "open to interesting problems"],
    ],
    skills: [
        ["languages", "C · C++ · C# · Python · SQL · JavaScript · TypeScript · Java · Swift · x86 · R"],
        ["frameworks", "React · Node.js · .NET · Three.js · OpenGL · OpenCV · PyTorch · LibTorch · Flask · GraphQL"],
        ["platforms", "Git · Docker · Linux · Firebase · MongoDB · GCP · AWS · Snowflake"],
        ["certs", "Snowflake: Data Warehousing · Collaboration & Marketplace"],
    ],
    bio: [
        "I like owning a problem end to end. Most of what I build starts with a question like “how does this actually work?”, and ends with me writing the part everyone else imports: the mesher, the buffer pool, the index.",
        "I studied computer science at UW–Madison, and now I write C# and SQL at Skyward, building the pipelines that move school districts' data between systems without losing a row. Outside of that I'm usually deep in a side project: lately that's a Rocket League bot trained with reinforcement learning, a disk-backed vector database in C++, and a fast-paced shooter in Three.js. Before all of that, I founded and ran an e-commerce brand to 30,000+ orders.",
    ],
};

export const experience = [
    {
        id: "skyward",
        company: "Skyward",
        role: "Software Engineer",
        period: "2025 — now",
        dates: "Feb 2025 – Present",
        place: "Stevens Point, WI",
        stack: ["C#", ".NET", "SQL", "SSMS"],
        url: "https://www.skyward.com",
        points: [
            "Build C#/.NET ETL pipelines that move school districts' demographics, payroll, and accounting data into Skyward's financial platform, including the deeply nested relational records that don't map one to one.",
            "Built automated SQL validation tooling that reconciles source and destination data, replacing the manual verification step that used to bottleneck onboarding.",
            "Added automated tests to migration workflows so invalid records are caught before they reach production.",
            "Work directly with district stakeholders on data requirements; migrations shipped for 15+ K-12 institutions so far.",
        ],
    },
    {
        id: "outlier",
        company: "Outlier",
        role: "AI Trainer: Math & Code",
        period: "2024",
        dates: "May 2024 – Sep 2024",
        place: "Remote",
        stack: ["Python", "Math", "OOP"],
        url: "https://outlier.ai",
        points: [
            "Wrote reference solutions for 100+ hard programming and math problems that frontier models were getting wrong, used as training data to push past baseline performance.",
            "Graded and rewrote model responses on distributed systems, object-oriented design, and mathematical computation.",
            "Helped set the code-quality and documentation standards that other trainers worked from.",
        ],
    },
    {
        id: "lastlock",
        company: "LastLock",
        role: "Backend Developer",
        period: "2024",
        dates: "Sep 2024 – Dec 2024",
        place: "Madison, WI",
        stack: ["Python", "OpenCV", "FastAPI", "React", "MongoDB"],
        project: "locked-in",
        points: [
            "Built a computer-vision pipeline that turns raster floor plans into geo-referenced GeoJSON rooms, cutting the time to map a building from hours to minutes.",
            "Designed the full stack: React + Mapbox front end, FastAPI backend, MongoDB and Cloudinary for storage. On a five-person team I also owned the cropping and text-removal stages and the GeoJSON merge step.",
            "See the Locked-In write-up below for the full computer-vision pipeline.",
        ],
    },
    {
        id: "animeatlas",
        company: "AnimeAtlas LLC",
        role: "Founder",
        period: "2021 — 2024",
        dates: "Mar 2021 – Aug 2024",
        stack: ["PyTorch", "Python", "E-commerce"],
        points: [
            "Started and ran an e-commerce brand from zero to 30,000+ orders: sourcing, suppliers, finance, legal, and investor relations.",
            "Trained PyTorch models on customer behaviour to target spend and bring acquisition cost down.",
            "Built automation for short-form content to grow organic traffic without a marketing team.",
        ],
    },
    {
        id: "heico",
        company: "HEICO",
        role: "Intern",
        period: "2020",
        dates: "Mar 2020 – Sep 2020",
        stack: ["Python", "ERP"],
        points: [
            "First engineering job: Python scripts around the company's ERP system to automate reporting and cut down on manual data entry.",
        ],
    },
];

export const projects = [
    {
        id: "babybot",
        title: "BabyBot",
        year: "2026",
        status: "solo",
        tagline: "A Rocket League bot trained from scratch with PPO. Against Nexto it wins first-to-50 1v1 series by 50–0 to 50–3.",
        stack: ["C++", "PPO", "GigaLearn", "RLGymCPP", "RocketSim", "LibTorch", "CUDA"],
        figure: "aerial",
        figureCaption:
            "The aerial reward's bookkeeping: car and ball travel piles up while the car is airborne and last to touch, the next touch cashes it in, and landing wipes it. The car here is scripted, not the trained policy.",
        metrics: [
            ["vs Nexto", "50–0 to 50–3"],
            ["series", "~20 × first to 50"],
            ["self-play", "256 games · 15 Hz"],
        ],
        links: [],
        body: `
## Why

Rocket League is a hard reinforcement-learning problem. The car moves in full 3D physics, drives up walls and flies, and the one thing that really matters, a goal, is rare next to the thousands of small decisions in between. Nexto is the bot most people in the RLGym community measure themselves against, so beating it was the target.

## How it's built

**1. Simulation, not the game.** Training runs on RocketSim, a headless re-implementation of Rocket League's physics, through RLGymCPP and GigaLearn, a C++ PPO learner built on LibTorch. 256 1v1 games step in parallel, and the bot plays against itself in all of them. It acts every 8 physics ticks, which is 15 decisions a second at the game's 120 Hz, with the 7-tick action delay other RLGym setups use. An episode ends on a goal, or after 10 seconds without anyone touching the ball. Along the way I also improved some of GigaLearn's parallelization code.

**2. The network.** A shared 512×512 trunk feeds a 512×512×512 policy head and a larger 768×512×512 critic, with ReLU, LayerNorm and Adam throughout, trained on CUDA. Each PPO iteration collects 100k steps and makes two passes over them in 25k minibatches. The discount is γ = 0.999, which at 15 decisions a second looks about a minute ahead (1 / (1 − γ) = 1,000 steps ≈ 67 s). That is long enough to connect a touch to the goal it sets up.

**3. What the bot sees.** I wrote my own observation builder, BetterObs, which also feeds in RocketSim's ball prediction, so the policy sees where the ball is going and not just where it is.

**4. Where episodes start.** Starting states are mixed: 25% kickoffs, 45% randomized field states, 25% aerial-shot setups and 5% air-dribble setups. The last two put the bot in exactly the situations the aerial rewards are trying to teach, far more often than it would find them by itself.

**5. A curriculum written in rewards.** Training ran in stages. It started with dense shaping just to get the bot touching the ball: facing it, closing speed, touches. Then came basic mechanics: speed, wavedashes, a penalty for floundering on its roof, and an energy term that adds up speed, height, boost and an unused flip as one physical quantity. After that came aerials and game sense: shots, kickoffs, boost pickups and steals, bumps and demos. Most of these are wrapped zero-sum, so whatever the bot earns, its opponent loses, and the two copies can't farm a reward together.

**6. Teaching aerials.** A plain reward for touching the ball in the air teaches the bot to jump and hope. Instead, an \`AerialStateReward\` base class tracks, for each car, how far the car and ball have travelled since that car's last touch, for as long as it stays above ramp height (256 uu). That distance is wiped the moment the car comes down. Only a touch with distance in the bank pays out, and paying out spends it. Four rewards share that gate: distance travelled, progress up the field, pressure (is the ball closer to the opponent's goal than the nearest defender?) and ball speed toward goal. Long, controlled aerials and air dribbles pay; random jumps don't. Alongside them are rewards for flip resets, and for bumping or demoing a defender while a shot is on target, paid only if the goal goes in.

**7. Then let it ride.** Shaping gets a bot to competence, but every shaped term is also something it can exploit. In the last stage I turned everything off except the goal reward: +1 for scoring and −0.75 for conceding, at a weight of 25,000. Conceding costs a little less than scoring earns, which keeps it attacking. From there it plays itself and gets better at the only thing that counts.

## Results

In 1v1 against Nexto I ran about 20 first-to-50 series. BabyBot won every one, with final scores between 50–0 and 50–3.
`,
    },
    {
        id: "aridb",
        title: "AriDB",
        year: "2025",
        status: "in progress",
        tagline: "A vector database written from scratch in C++: an HNSW index that pages itself off disk.",
        stack: ["C++17", "HNSW", "Buffer management", "Make"],
        figure: "hnsw",
        figureCaption: "Greedy search through HNSW layers: enter at the sparse top layer, hop toward the query, drop a layer, repeat.",
        metrics: [
            ["M", "16 / 32"],
            ["ef", "128 build · 64 search"],
            ["metric", "cosine"],
        ],
        links: [{ label: "source", url: "https://github.com/abszd/AriDB" }],
        body: `
## Why

Vector search is the storage engine behind every embedding-powered feature, and most people only ever see it through a client library. I wanted to know what happens underneath, so AriDB is the whole thing, written by hand: the graph index, the similarity math, and the buffer pool that decides which parts of the graph live in memory.

## How it's built

**1. The index.** AriDB uses a Hierarchical Navigable Small World graph. Every vector is inserted at layer 0, and is also promoted to higher layers with exponentially decaying probability: \`level = ⌊−ln(U) · mL⌋\` with \`mL = 1 / ln(M)\`. The top layers end up sparse, like express lanes, and layer 0 is dense.

**2. Search.** A query enters at the top layer's entry point and walks greedily toward its nearest neighbour, then drops a layer and repeats with a wider beam. Candidates are tracked in priority queues, with 128 candidates while building and 64 while searching.

**3. Linking.** New nodes connect bidirectionally to their closest candidates. When a neighbour's list overflows (16 links on upper layers, 32 on layer 0), it is re-sorted with a binary-search insert and the weakest link is pruned on both ends, so the graph never holds dangling edges.

**4. Cosine without the cost.** Each node stores \`1/‖v‖\` when it is inserted, so every comparison is a single dot product times a cached scalar instead of two square roots.

**5. Getting it off the heap.** Indexes outgrow RAM, so I'm building a disk-backed buffer manager. Nodes are serialized into fixed-size frames in \`hnsw.bin\`, behind a 64-byte header. Frames carry pin counts, dirty bits and reference bits, and are evicted with the clock algorithm.

## The interesting problem

Most nodes only exist on layer 0, but a few reach five or more layers. Reserving space for every layer inline wasted most of each frame. Upper-layer neighbour lists now live in separate level pools sized in powers of two (1, 2, 4, 8 and 16 levels), and each node stores a packed \`pool:offset\` id that points into the right one.

## Status

The in-memory index (insert, search, bidirectional pruning) runs and has tests. The disk-backed insert path and the buffer pool are what I'm working on now.
`,
    },
    {
        id: "minecraft",
        title: "Browser Minecraft",
        year: "2025",
        status: "playable",
        tagline: "A voxel engine in the browser with multithreaded chunk generation, greedy meshing, and custom GLSL.",
        stack: ["JavaScript", "Three.js", "GLSL", "Web Workers", "Vite"],
        figure: "greedy",
        figureCaption: "Greedy meshing: per-face masks are swept and merged into the largest possible quads before they reach the GPU.",
        metrics: [
            ["1% lows", "10× better"],
            ["GPU memory", "−90%"],
            ["workers", "cores + cores/2"],
        ],
        links: [
            { label: "play", url: "https://abszd.github.io/minecraft" },
            { label: "source", url: "https://github.com/abszd/minecraft" },
        ],
        body: `
## Why

Minecraft looks simple until you try to render it. A world is millions of blocks, and the naive approach of one cube per block falls over immediately. This project was about building every layer myself, from terrain generation to the threading model and shaders, and making it smooth in a browser tab.

## How it's built

**1. Terrain.** Height comes from three layers of simplex fBm: *continentalness*, *mountains/valleys* and *peaks*. Each one is remapped through its own spline curve and then combined multiplicatively, which is the same idea modern Minecraft uses to get flat plains next to sharp ridges. The surface block depends on slope: I take central differences of the height field, so steep faces become stone, moderate slopes become dirt, and flat ground becomes grass, with sand along the waterline. Trees are placed on top.

**2. Two worker pools.** Generating terrain and building meshes run on separate Web Worker pools, sized to \`hardwareConcurrency\` and half of that. A small buffer-pool scheduler hands chunks to free worker "frames" round-robin. Requests are keyed by chunk and their priority can be upgraded while they wait, and in-flight jobs are cancelled when the render distance changes. Results go to the GPU during \`requestIdleCallback\` (with a fallback for Safari), so the main thread never stalls.

**3. Greedy meshing.** For each of the six face directions, the mesher builds a 2D mask of the faces that touch air or a transparent block, then sweeps it and grows each face into the largest rectangle of the same block type. Thousands of quads per chunk collapse into hundreds.

**4. One material per chunk.** Block textures are packed into a \`DataArrayTexture\`, and the layer index rides along as a vertex attribute. A whole chunk renders with one material and one draw call instead of one per block type.

**5. Culling.** Each chunk keeps a bounding box that is tested against the camera frustum every frame, so anything behind you isn't drawn, and faces buried inside solid terrain never make it into a mesh.

**6. Shaders.** Water is displaced in the vertex shader by eight octaves of simplex noise, with normals recovered by finite differences and an HDR environment map for reflections. Leaves sway, grass is tinted, and everything fades out at the render distance.

**7. The player.** AABB collision is swept one axis at a time, with step-up, gravity, sprint and fly. Blocks are broken and placed by raycast, edits to the world persist, and there's an inventory, a hotbar, and a first-person arm.

## Results

Moving chunk work onto worker pools improved 1% low frame rates by about 10×, and greedy meshing plus culling cut GPU memory use by about 90% compared with the first version.
`,
    },
    {
        id: "hotstreak",
        title: "HotStreak",
        year: "2026",
        status: "in progress",
        tagline: "A movement-first browser FPS with jetpacks, slides, and a procedurally built combat map.",
        stack: ["JavaScript", "Three.js", "Vite", "Rapier"],
        figure: "collide",
        figureCaption: "Sphere-swept collision: the player casts ahead along its velocity and slides along whatever it hits.",
        metrics: [
            ["started", "Jan 2026"],
            ["gravity", "custom"],
            ["map", "procedural"],
        ],
        links: [{ label: "source", url: "https://github.com/abszd/HotStreak" }],
        body: `
## Why

After the voxel engine I wanted to work on *feel*: the small details of camera motion and momentum that make a shooter fun to move around in. HotStreak is a fast arena FPS where movement comes first.

## How it's built

**1. Momentum, not position.** Input adds to a velocity vector that decays by a friction factor every frame, so stopping, strafing and changing direction all carry weight. Sprint multiplies acceleration rather than top speed.

**2. Movement kit.** A timed slide (crouch while sprinting) locks your direction and lowers the collider, with a cooldown so it can't be spammed. The jetpack burns from a fuel tank that refills while you're grounded.

**3. Camera and weapon feel.** The camera rolls into strafes and pitches with vertical motion, eased with frame-rate-independent damping. The gun is built from primitives in code, trails the camera with its own sway, and kicks back on recoil.

**4. Procedural combat map.** Height-varied terrain with a flattened play area and cross-cutting paths, filled with cover: sandbag walls (as instanced geometry), crate clusters, jersey barriers, bunkers, trenches, vehicle wrecks and watchtowers. It all uses shared materials to keep the number of draw calls down.

**5. Collision.** The player is a sphere. Each frame it casts rays along its velocity, stops a safe distance from whatever it would hit, and slides along the surface. This is the part I'm working on now, and Rapier is set up to take over the physics.

## Status

Early, playable prototype. Next up: solid collision, then enemies and a scoring loop.
`,
    },
    {
        id: "badger-grades",
        title: "Badger Grades",
        year: "2024",
        status: "live",
        tagline: "Course search for UW–Madison students that puts grade distributions next to every filter.",
        stack: ["React", "Firebase", "Firestore", "Python", "Chart.js", "Tailwind"],
        figure: "grades",
        figureCaption: "Grade distributions next to the filters: requirement flags are packed into a bitmask so any combination is a single query.",
        metrics: [
            ["courses", "30,000+"],
            ["queries", "sub-second"],
            ["users", "hundreds"],
        ],
        links: [
            { label: "visit", url: "https://badgergrades.com" },
            { label: "source", url: "https://github.com/abszd/badger-grades" },
        ],
        body: `
## Why

Picking classes at UW meant switching between Course Search & Enroll, which has the requirements, and Madgrades, which has the grade history. Badger Grades puts both in one search.

## How it's built

**1. The data.** An automated Python scraping pipeline pulls official grade distributions for 30,000+ UW–Madison courses (with help from the Madgrades API) along with their requirement attributes, then cleans and joins them into two Firestore collections. \`courses\` holds a small, indexed, searchable summary of each course. \`courseInfo\` holds the detailed data for each term and is only fetched when you open a course.

**2. Filters as queries.** GPA, credit and course-number ranges become paired \`>=\` and \`<=\` constraints. Breadth requirements and course levels are packed into bit flags (biological = 1, humanities = 2, literature = 4 …), so any combination of checkboxes is a single equality match instead of a fan-out of queries.

**3. Cheap pagination.** Composite indexes keep filtered queries under a second. Results are fetched 25 at a time with Firestore cursors (\`startAfter\` / \`endBefore\` + \`limitToLast\`), so browsing never reads more documents than it shows. You can sort by GPA or course number.

**4. The course view.** Chart.js bar charts show the grade distribution for all terms combined or for a single term, next to the course's requirements and description.

**5. Shipping.** React 18 with hash routing, so it runs on static hosting. Tailwind is used for styling, and view transitions animate between pages. A lot of the late commits went into the mobile Safari \`vh\` bug.

## Impact

Hundreds of students used it during enrollment to see how a class actually grades before signing up.
`,
    },
    {
        id: "locked-in",
        title: "Locked-In",
        year: "2024",
        status: "team · 5",
        tagline: "Turns raster floor plans into geo-referenced GeoJSON rooms with classical computer vision.",
        stack: ["Python", "OpenCV", "scikit-image", "FastAPI", "MongoDB", "React", "Mapbox"],
        figure: "watershed",
        figureCaption: "Distance transform → seeded watershed: each room floods outward from its own peak until it meets a neighbour.",
        metrics: [
            ["team", "5 engineers"],
            ["for", "LastLock"],
            ["output", "GeoJSON"],
        ],
        links: [{ label: "source", url: "https://github.com/abszd/locked-in-backend" }],
        body: `
## Why

Mapping indoor spaces usually means someone tracing every room of every floor by hand. Working with LastLock, our team built a pipeline that takes a floor-plan image plus the building's bounding coordinates and returns map-ready room polygons.

## How it's built

**1. Upload.** A React + Mapbox GL front end posts the image and coordinates to a FastAPI backend. Originals and processed images go to Cloudinary, and buildings, floors and polygons go to MongoDB.

**2. Text removal.** Room labels and dimensions confuse segmentation, so text regions are detected with OCR and masked, then inpainted away with two passes (Navier–Stokes, then Telea) so that the walls stay continuous.

**3. Floor extraction.** Threshold, morphological close, flood fill from the border and invert, then keep the largest contour. The plan is cropped to that footprint and every margin, legend and title block is discarded.

**4. Room segmentation.** Otsu binarization followed by a Euclidean distance transform. Peaks that are maxima at both a large and a small window size (or simply very far from any wall) become markers. A watershed on the inverted distance map floods outward from each marker, so rooms separate even across door gaps. Regions touching the border and tiny regions are then removed.

**5. To the map.** Each region's contour is projected from pixel space into the building's lat/long bounds and written out as GeoJSON polygons with area metadata. In the front end you can place, resize and merge per-floor layers over the real building.

## Result

Mapping a building went from hours of hand tracing to a few minutes of upload and review.

## My part

The API and database (MongoDB + Cloudinary), the cropping and text-removal stages, optimizations to room identification, the GeoJSON merge algorithm, and the whole React + Mapbox front end.
`,
    },
    {
        id: "viralbear",
        title: "ViralBear",
        year: "2024",
        status: "v1.0",
        tagline: "An end-to-end short-form video pipeline: clip, caption, schedule, and post, all unattended.",
        stack: ["Python", "MoviePy", "ffmpeg", "faster-whisper", "Selenium"],
        figure: "captions",
        figureCaption: "Word-level timestamps from Whisper drive burned-in captions on a split-screen vertical edit.",
        metrics: [
            ["captions", "word-level"],
            ["platforms", "TikTok · YT"],
            ["schedule", "per channel"],
        ],
        links: [{ label: "source", url: "https://github.com/abszd/ViralBear" }],
        body: `
## Why

Growing short-form channels by hand is a lot of repetitive editing and posting. ViralBear automates the whole loop so that a channel posts on schedule without anyone opening an editor.

## How it's built

**1. Sourcing.** Clips are found and downloaded with requests, BeautifulSoup and Selenium. Their ids are cached so nothing is processed twice.

**2. The edit.** MoviePy builds the vertical split-screen format: the source clip sits on top, panned up, and a random slice of background gameplay of exactly the same length fills the bottom. The result is rendered to H.264/AAC.

**3. Captions.** ffmpeg pulls the audio out, and faster-whisper transcribes it with word-level timestamps. Those timings drive the burned-in captions one word at a time, which is the style that holds attention.

**4. Scheduling.** Each channel has its own weekly posting slots, as hours per weekday. The scheduler finds the next open slot after anything already queued and rolls over to the next day after the last slot.

**5. Posting.** Selenium drives the TikTok and YouTube upload flows using saved session cookies for each channel, and a small CLI menu adds and removes channels.
`,
    },
    {
        id: "systems",
        title: "Systems Coursework",
        year: "2024 — 25",
        status: "UW–Madison",
        tagline: "A FUSE filesystem, xv6 kernel threading, and a relational DBMS's buffer manager and query layer.",
        stack: ["C", "C++", "FUSE", "xv6"],
        figure: "clock",
        figureCaption: "Clock replacement: the hand sweeps frames, clearing reference bits, and evicts the first unpinned frame it finds cold.",
        metrics: [
            ["fs", "FUSE"],
            ["kernel", "xv6"],
            ["db", "Minirel"],
        ],
        links: [
            { label: "minirel", url: "https://github.com/abszd/CS564-TheBigOne" },
            { label: "wfs", url: "https://github.com/abszd/P7" },
            { label: "xv6", url: "https://github.com/abszd/p5-main" },
        ],
        body: `
## Why it's here

These are the class projects that taught me how storage and operating systems actually work. AriDB's buffer pool exists because of them.

## WFS: a filesystem in userspace

A \`mkfs\` that lays out a superblock, inode and data bitmaps, and the inode and data regions on a disk image, plus a FUSE daemon that mounts it. It implements \`getattr\`, \`mkdir\`, \`unlink\`, \`rmdir\`, \`read\`, \`write\` and \`readdir\` by walking paths through directory entries and allocating blocks from the bitmaps.

## xv6: kernel threads and locks

I extended the xv6 teaching kernel with a \`clone\` system call for threads that share an address space, sleeping mutexes (\`macquire\` / \`mrelease\`), and \`nice\` for adjusting scheduling priority.

## Minirel: a DBMS from the bottom up

A team project, built layer by layer. I wrote the buffer manager: \`allocBuf\`, \`readPage\`, \`unPinPage\` and friends, with clock replacement over frames that carry pin counts, dirty bits and reference bits. In the final part I built the query layer's insert and select (with delete) on top of heap files and the catalog.
`,
    },
    {
        id: "radiation-robot",
        title: "Radiation Detection Robot",
        year: "earlier",
        status: "hardware",
        tagline: "An autonomous Arduino robot that tracks down radioactive sources. The project won a grant.",
        stack: ["C++", "Arduino", "Sensors"],
        figure: "robot",
        figureCaption: "Sampling a field and climbing its gradient while steering around obstacles.",
        metrics: [
            ["mcu", "Arduino"],
            ["sensor", "Geiger"],
            ["result", "grant winner"],
        ],
        links: [],
        body: `
## Overview

A small autonomous robot that searches a space for a radioactive source. It reads a Geiger counter while it drives, steers around obstacles, and uses the rising count rate to narrow in on the source.

## How it's built

**1. Firmware.** Low-level C++ on an Arduino, with sensor reads driven by interrupts so that Geiger pulses are never missed while the motors are being driven.

**2. Navigation.** Obstacle avoidance from range sensors, combined with movement that adapts to the readings: when counts rise, the robot slows down and samples more densely.

**3. Sensor fusion.** Readings from multiple sensors are combined with position estimates to locate the source precisely, rather than trusting any single noisy sample.

## Result

The project won a grant.
`,
    },
];
