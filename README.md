# OneClick Portfolio

OneClick Portfolio is a static frontend for importing an `rxresu.me` JSON resume, selecting a theme, and deploying through a separate backend API.

This repository contains the frontend only. The deployment, GitHub auth, and resume validation flows depend on a backend that must be running separately.

## Local Setup

1. Start your backend locally.
2. Set the backend base URL in [config.js](config.js).
3. Serve this frontend locally.

Example local frontend run:

```bash
make dev
```

Default URL:

```text
http://localhost:4173
```

Custom port:

```bash
make dev PORT=3000
```

You can also use any static file server, for example:

```bash
npx serve
```

## API Base URL

The frontend reads the backend URL from [config.js](config.js):

```js
const CONFIG = {
	apiBase: 'http://localhost:8080',
	deploy: {
		themeRepoLink: 'https://github.com/oneclick-portfolio/awesome-github-portfolio/tree/main'
	}
};
```

Use this value based on your environment:

- Local backend: set `apiBase` to your local server, for example `http://localhost:8080`
- Production backend: set `apiBase` to your deployed API, for example `https://op-bot-mauve.vercel.app`

The `Authorize GitHub` flow, auth status checks, resume validation, logout, and deploy actions all use this base URL.

The deploy API also requires `deploy.themeRepoLink` in [config.js](config.js). This value is sent to the backend in every deploy request and controls which GitHub repository is used as the theme source.

## Backend Endpoints Expected By The Frontend

The frontend expects the backend to expose these routes:

- `GET /auth/github/start`
- `GET /api/github/me`
- `POST /api/github/logout`
- `POST /api/resume/validate`
- `POST /api/github/deploy`

If the backend is not running or `apiBase` is wrong, the UI will load but GitHub connect, validation, and deployment actions will fail.

## Adding More Theme Support

To add a new theme to the frontend flow, update both the preview assets and the theme selector UI.

1. Add a new folder under [themes](themes) using the same structure as existing themes.
2. Include required files for the theme bundle:
Use [themes/modern/index.html](themes/modern/index.html) as the entry-page reference, [themes/modern/app.js](themes/modern/app.js) as the script reference, and either [themes/modern/styles.css](themes/modern/styles.css) or [themes/newspaper/style.css](themes/newspaper/style.css) as stylesheet naming references.
3. In [index.html](index.html), add a new theme card in the Step 3 theme grid with:
A radio input using a unique value for the theme key, for example value="minimal", and a preview link pointing to ./themes/<theme-key>/index.html.
4. Keep the theme key consistent everywhere:
The radio input value in [index.html](index.html) and the backend supported theme list in [op-bot/config.go](../op-bot/config.go).
5. Test the full flow locally:
Select the new theme in the UI, deploy, confirm the request sends the new theme key to /api/github/deploy, and verify deployed output and generated repository content.

Notes:

- The frontend sends themeRepoLink from [config.js](config.js). This controls which repository is used as the source for theme files.
- Adding a new frontend theme option without adding backend support for the same theme key will fail deployment.

## Local Workflow

1. Run your backend locally.
2. Set `apiBase` in [config.js](config.js) to that backend URL.
3. Start the frontend with `make dev` or `npx serve`.
4. Open the frontend in the browser.
5. Click `Authorize GitHub` and continue the flow.

## Structure

- [index.html](index.html)
- [config.js](config.js)
- [src/rxresume.js](src/rxresume.js)
- [resume/Reactive Resume.json](resume/Reactive%20Resume.json)
- [themes](themes)
- [Makefile](Makefile)
