# abszd.github.io/portfolio

Personal site for Arian Abbaszadeh. Built with React 19 and Vite, with no UI framework and no templates.

## What's in here

- **Generative background** (`src/components/Background.jsx`): a WebGL2 fragment shader that draws a halftone dot field. The dots come from domain-warped simplex fBm, contour lines are traced through the same field, the cursor acts as a lens, and clicks send out ripples. It renders in two passes: the noise is evaluated once per dot cell into a small texture, then the screen pass samples it. If WebGL2 isn't available, it falls back to the gradient blobs from the original site.
- **Per-project figures** (`src/figures/`): small canvas simulations that show how each project works, including a voxel chunk pipeline, an HNSW layer search, a watershed segmentation, clock buffer replacement and more. They pause when off-screen and render a single still frame for `prefers-reduced-motion`.
- **Content** (`src/data.js`): all copy lives here, and project write-ups are Markdown strings. To edit the site, edit this file.

## Scripts

```bash
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run deploy   # manual deploy: build and publish dist/ to the gh-pages branch
```

Every push to `main` deploys automatically via `.github/workflows/deploy.yml`, which builds the site and publishes it to the `gh-pages` branch. It can also be run by hand from the Actions tab.

The site is served from `/portfolio/` (see `base` in `vite.config.js`). Project pages use hash routes (`#/project/<id>`), so deep links work on GitHub Pages.
