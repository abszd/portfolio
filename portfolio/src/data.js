export const projects = [
    {
        id: 1,
        title: "Browser Minecraft",
        shortDesc: "Minecraft clone built in the browser",
        markdown: `
## 🎮 Performance Optimizations
- **Chunk-based world system** with multithreaded meshing
- **1000%+ improvement** in 1% FPS lows
- **~90% reduction** in memory draw through frustum culling and greedy meshing

## 🎨 Visual Features
- Custom **GLSL shaders** for animated leaves and dynamic water
- Advanced **wave simulation** with environmental reflection
- Realistic **lighting and shadow systems**

## 🎯 Core Systems
- **First-person controller** with gravity physics
- Robust and consistent **collision detection**
- **Procedural terrain generation** using Perlin noise
- **Persistent user modifications** with save/load functionality

## 🔧 Technical Implementation
- \`WebWorkers\` for multithreaded chunk generation
- \`Three.js\` renderer optimizations
- Custom mesh batching algorithms
        `,
        tech: ["JavaScript", "Three.js", "GLSL", "Multithreading", "WebWorkers"],
        links: [
            { type: "website", url: "https://abszd.github.io/minecraft" },
            { type: "github", url: "https://github.com/abszd/minecraft" },
        ],
    },
    {
        id: 2,
        title: "Badger Grades",
        shortDesc: "UW Madison grade finder tool",
        markdown: `
## 📊 Data Processing
- Automated scripts to extract **GPA and attribute data** from **30,000+ courses**
- Intelligent data aggregation and cleaning pipeline
- **Firebase/Firestore** integration for real-time updates

## 🔍 User Experience
- **Dynamic search interface** with instant filtering
- Interactive **grade distribution visualizations**
- Mobile-responsive design serving **hundreds of students**

## ⚡ Performance Optimization
- **Optimized database indexing** for sub-second queries
- **RESTful API** design for efficient data retrieval
- Cached results for frequently accessed courses

## 🎯 Impact
- Simplified course selection for UW Madison students
- Reduced time spent researching course difficulty
- Democratized access to grade distribution data
        `,
        tech: ["React", "Javascript", "Python", "Tailwind", "Firebase", "RESTful API", "JSON"],
        links: [
            { type: "website", url: "https://badgergrades.com" },
            { type: "github", url: "https://github.com/abszd/badger-grades" },
        ],
    },
    {
        id: 3,
        title: "ViralBear",
        shortDesc: "Automated content generation and posting tool",
        markdown: `
## 🤖 Automation Pipeline
- **End-to-end content generation** from ideation to publication
- **Multi-platform distribution** across social media channels
- Intelligent **scheduling algorithms** for optimal engagement

## 🎬 Content Processing
- **Video editing automation** using \`ffmpeg\`
- **Image processing** and optimization
- **Text generation** with natural language processing

## 📈 Growth Optimization
- **Analytics integration** for performance tracking
- **A/B testing** for content optimization
- **Engagement rate analysis** and strategy adjustment

## 🔐 Security & Authentication
- **OAuth integration** for multiple social platforms
- **Rate limiting** and API quota management
- **Secure credential storage** and rotation
        `,
        tech: ["Python", "Selenium", "ffmpeg", "Webscraping", "Authentication"],
        links: [{ type: "github", url: "https://github.com/abszd/viralbear" }],
    },
    {
        id: 4,
        title: "Radiation Detection Robot",
        shortDesc: "Autonomously navigating robot with radiation detection capabilities",
        markdown: `
## 🤖 Autonomous Navigation
- **Real-time pathfinding** algorithms for obstacle avoidance
- **Environmental mapping** using sensor fusion
- **Adaptive movement patterns** based on radiation readings

## 📡 Sensor Integration
- **Multi-sensor fusion** for precise substance location
- **Geiger counter integration** with Arduino microcontroller
- **Real-time data processing** and analysis

## 💻 Embedded Programming
- **Low-level C++ firmware** for Arduino platform
- **Interrupt-driven** sensor reading for responsiveness
- **Power management** optimization for extended operation

## 🎯 Safety Applications
- **Nuclear facility monitoring** capabilities
- **Emergency response** automation
- **Environmental hazard detection**
        `,
        tech: ["Arduino", "Firmware", "C++"],
        links: [],
    },
];

export const workExperience = [
    {
        id: 5,
        company: "Skyward",
        position: "Software Engineer",
        duration: "February 2025 - Present",
        tech: ["C#", ".NET", "SQL", "SSMS"],
        markdown: `
## 🏗️ Data Migration Solutions 
- Develop **robust C# and .NET applications** for complex data transformations
- Handle **demographics, accounting, and payroll data** with nested relational structures
- Ensure **data integrity** throughout migration processes

## 🗄️ Database Optimization
- Utilize **SQL Server Management Studio (SSMS)** for advanced query optimization
- Design **validation frameworks** for source-to-destination data verification
- Implement **performance monitoring** for large-scale data operations

## 🤝 Client Collaboration
- **Direct partnerships** with school districts nationwide
- **Requirements gathering** and technical consultation
- **Custom solution development** for unique district needs

## 📊 Impact & Scale
- **Seamless data migrations** for educational institutions
- **Zero-downtime** deployment strategies
- **Improved operational efficiency** for school administrative systems
        `,
        links: [{ type: "linkedin", url: "https://www.linkedin.com/company/skyward" }],
    },
    {
        id: 6,
        company: "Outlier",
        position: "Math/Coding LLM Trainer",
        duration: "May 2024 - February 2025",
        tech: ["Python", "Math", "OOP", "Cloud Integration"],
        markdown: `
## 🧠 AI Model Enhancement
- Engineer **high-quality code solutions** for complex mathematical challenges
- **Consistently outperform** current SOTA (State-of-the-Art) LLMs
- Develop **advanced problem-solving methodologies**

## 📈 Performance Optimization
- **Evaluate and enhance** LLM-generated responses across multiple domains
- Focus on **cloud integration, OOP, and mathematical modeling**
- Implement **systematic improvement processes**

## 📋 Quality Assurance
- Develop **standardized code quality metrics**
- Create **comprehensive documentation practices**
- Design **training pipeline optimization** strategies

## 🎯 Technical Leadership
- **Mentor junior trainers** on best practices
- **Research emerging AI technologies** and implementation strategies
- **Bridge the gap** between academic research and practical applications
        `,
        links: [{ type: "linkedin", url: "https://www.linkedin.com/company/try-outlier" }],
    },
    {
        id: 7,
        company: "LastLock",
        position: "Project Backend Developer",
        duration: "September 2024 - December 2024",
        tech: ["Python", "OpenCV", "Javascript", "React", "MongoDB", "Cloudinary"],
        markdown: `
## 🏗️ Computer Vision Innovation
- Architected **proprietary system** for raster-to-GeoJSON conversion
- Utilized **advanced computer vision algorithms** for floor plan analysis
- **Significantly reduced** building mapping time for developers

## 🔧 Full-Stack Development
- Built **React frontend** with intuitive user interface
- Developed **Python backend** with robust API architecture
- Integrated **MongoDB and Cloudinary** for scalable data management

## 🎨 Image Processing Pipeline
- Implemented **image segmentation algorithms** for precise floor plan analysis
- Developed **vectorization processes** using OpenCV
- Created **automated quality assurance** systems

## 📊 Business Impact
- **Streamlined workflow** for property mapping teams
- **Reduced manual processing** time by 80%
- **Improved accuracy** of digital floor plan representations
        `,
        links: [{ type: "linkedin", url: "https://www.linkedin.com/company/last-lock" }],
    },
    {
        id: 8,
        company: "AnimeAtlas LLC",
        position: "Founder",
        duration: "March 2021 - August 2024",
        tech: ["PyTorch", "E-commerce", "Financial Management"],
        markdown: `
## 🚀 Business Leadership
- **Founded and scaled** e-commerce company from concept to **30,000+ sales**
- Managed **financial and legal operations** including investor relations
- **Negotiated partnerships** with affiliates, suppliers, and stakeholders

## 🤖 AI-Driven Optimization
- Created **customer behavior models** using PyTorch
- **Reduced customer acquisition cost** through predictive analytics
- Implemented **machine learning algorithms** for inventory optimization

## 📈 Growth & Marketing
- Developed **automated content generation** tools for organic growth
- **Scaled social media presence** to drive website traffic
- Built **data-driven marketing strategies** with measurable ROI

## 💼 Operational Excellence
- **End-to-end business management** from product sourcing to customer service
- **Supply chain optimization** and vendor relationship management
- **Financial planning and analysis** for sustainable growth
        `,
        links: [{ type: "linkedin", url: "https://www.linkedin.com/in/arian-abbaszadeh/" }],
    },
    {
        id: 9,
        company: "Heico",
        position: "Intern",
        duration: "March 2020 - September 2020",
        tech: ["Python", "ERP"],
        markdown: `
## 🏭 Enterprise Systems
- Developed **Python-based solutions** for internal process automation
- Worked extensively with **Enterprise Resource Planning (ERP)** systems
- **Streamlined data management** workflows across departments

## 📊 Process Optimization
- **Analyzed existing workflows** and identified improvement opportunities
- **Implemented automated reporting** systems for management insights
- **Reduced manual data entry** through intelligent automation

## 🔧 Technical Development
- **Database integration** and data pipeline development
- **Custom scripting** for repetitive task automation
- **Documentation and training** for internal tool adoption

## 🎯 Learning & Growth
- **First professional software development** experience
- **Mentorship from senior engineers** on industry best practices
- **Foundation building** in enterprise software development
        `,
        links: [{ type: "linkedin", url: "https://www.linkedin.com/company/heico-aerospace" }],
    },
];
