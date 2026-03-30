require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020').default;

const app = express();
const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 8080);

const GITHUB_APP_CLIENT_ID = (process.env.GITHUB_APP_CLIENT_ID || '').trim();
const GITHUB_APP_CLIENT_SECRET = (process.env.GITHUB_APP_CLIENT_SECRET || '').trim();
const GITHUB_APP_INSTALL_URL = normalizeInstallUrl((process.env.GITHUB_APP_INSTALL_URL || '').trim());

const OAUTH_STATE_COOKIE = 'gh_oauth_state';
const OAUTH_RETURN_COOKIE = 'gh_oauth_return';
const OAUTH_TOKEN_COOKIE = 'gh_access_token';

const THEME_FILES = {
  modern: {
    index: 'themes/modern/index.html',
    app: 'themes/modern/app.js',
    style: 'themes/modern/styles.css'
  },
  graphic: {
    index: 'themes/graphic/index.html',
    app: 'themes/graphic/app.js',
    style: 'themes/graphic/style.css'
  },
  newspaper: {
    index: 'themes/newspaper/index.html',
    app: 'themes/newspaper/app.js',
    style: 'themes/newspaper/style.css'
  },
  vscode: {
    index: 'themes/vscode/index.html',
    app: 'themes/vscode/app.js',
    style: 'themes/vscode/style.css'
  }
};

app.use(express.json({ limit: '1mb' }));

let resumeValidatorPromise = null;

function formatAjvErrors(errors) {
  if (!Array.isArray(errors)) return [];
  return errors.slice(0, 20).map((error) => {
    const pointer = error.instancePath || '/';
    const detail = error.message || 'invalid value';
    return `${pointer} ${detail}`;
  });
}

async function getResumeValidator() {
  if (resumeValidatorPromise) return resumeValidatorPromise;

  resumeValidatorPromise = (async () => {
    const schemaPath = path.join(ROOT_DIR, 'tests', 'rxresume.schema.json');
    let schema;
    try {
      schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
    } catch (_error) {
      const response = await fetch('https://rxresu.me/schema.json');
      if (!response.ok) {
        throw new Error(`Unable to load resume schema: HTTP ${response.status}`);
      }
      schema = await response.json();
    }

    const ajv = new Ajv2020({ allErrors: true, strict: false });
    return ajv.compile(schema);
  })();

  return resumeValidatorPromise;
}

async function validateResumeData(resumeData) {
  if (!resumeData || typeof resumeData !== 'object' || Array.isArray(resumeData)) {
    return {
      valid: false,
      errors: ['/ must be a JSON object']
    };
  }

  const validate = await getResumeValidator();
  const isValid = validate(resumeData);

  return {
    valid: Boolean(isValid),
    errors: formatAjvErrors(validate.errors)
  };
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};

  return header.split(';').reduce((acc, part) => {
    const [rawName, ...rawValueParts] = part.trim().split('=');
    if (!rawName) return acc;
    const value = rawValueParts.join('=');
    acc[rawName] = decodeURIComponent(value || '');
    return acc;
  }, {});
}

function setCookie(res, name, value, options = {}) {
  const opts = {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    ...options
  };

  const segments = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge !== undefined) segments.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) segments.push(`Path=${opts.path}`);
  if (opts.httpOnly) segments.push('HttpOnly');
  if (opts.secure) segments.push('Secure');
  if (opts.sameSite) segments.push(`SameSite=${opts.sameSite}`);

  res.append('Set-Cookie', segments.join('; '));
}

function clearCookie(res, name) {
  setCookie(res, name, '', { maxAge: 0 });
}

function requireGitHubAppConfig(res) {
  if (!GITHUB_APP_CLIENT_ID || !GITHUB_APP_CLIENT_SECRET) {
    res.status(500).json({
      error: 'GitHub App auth is not configured. Set GITHUB_APP_CLIENT_ID and GITHUB_APP_CLIENT_SECRET.'
    });
    return false;
  }
  return true;
}

function validateTheme(theme) {
  return Object.prototype.hasOwnProperty.call(THEME_FILES, theme);
}

function normalizeRepoName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

function normalizeInstallUrl(url) {
  if (!url) return '';

  // Accept both app home URL and direct install URL.
  if (/\/installations\//.test(url)) return url;
  if (/^https:\/\/github\.com\/apps\/[^/]+\/?$/i.test(url)) {
    return `${url.replace(/\/$/, '')}/installations/new`;
  }

  return url;
}

async function readTextFile(relativePath) {
  return fs.readFile(path.join(ROOT_DIR, relativePath), 'utf8');
}

async function readBinaryFile(relativePath) {
  return fs.readFile(path.join(ROOT_DIR, relativePath));
}

function buildWorkflowYaml() {
  return `name: Deploy GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: .

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
        with:
          enablement: true
`;
}

function buildRepositoryReadme(themeName, pagesUrl) {
  return `# Portfolio (${themeName})

This repository was generated automatically from the portfolio theme deployer.

## Live Site

${pagesUrl}

## Local Preview

\`python3 -m http.server 8080\`
`;
}

function getThemeLabel(theme) {
  return theme.charAt(0).toUpperCase() + theme.slice(1);
}

function transformThemeIndex(indexHtml) {
  return indexHtml
    .replace('../../config.js', './config.js')
    .replace('../../src/rxresume.js', './src/rxresume.js');
}

async function buildThemeBundle(theme, resumeData) {
  const selection = THEME_FILES[theme];

  const [indexHtml, appJs, styleCss, configJs, rxresumeJs, resumeJson, faviconSvg, faviconIco] = await Promise.all([
    readTextFile(selection.index),
    readTextFile(selection.app),
    readTextFile(selection.style),
    readTextFile('config.js'),
    readTextFile('src/rxresume.js'),
    resumeData ? Promise.resolve(`${JSON.stringify(resumeData, null, 2)}\n`) : readTextFile('resume/Reactive Resume.json'),
    readTextFile('favicon.svg'),
    readBinaryFile('favicon.ico')
  ]);

  const styleFileName = path.basename(selection.style);
  const pagesUrlPlaceholder = 'https://<username>.github.io/<repository>/';

  return [
    { path: 'index.html', content: transformThemeIndex(indexHtml), encoding: 'utf-8' },
    { path: 'app.js', content: appJs, encoding: 'utf-8' },
    { path: styleFileName, content: styleCss, encoding: 'utf-8' },
    { path: 'config.js', content: configJs, encoding: 'utf-8' },
    { path: 'src/rxresume.js', content: rxresumeJs, encoding: 'utf-8' },
    { path: 'resume/Reactive Resume.json', content: resumeJson, encoding: 'utf-8' },
    { path: 'favicon.svg', content: faviconSvg, encoding: 'utf-8' },
    { path: 'favicon.ico', content: faviconIco, encoding: 'binary' },
    { path: '.github/workflows/deploy-pages.yml', content: buildWorkflowYaml(), encoding: 'utf-8' },
    { path: 'README.md', content: buildRepositoryReadme(getThemeLabel(theme), pagesUrlPlaceholder), encoding: 'utf-8' }
  ];
}

async function ghRequest(token, endpoint, options = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const message = payload?.message || `GitHub API request failed with status ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  return payload;
}

async function getGitHubUserFromToken(token) {
  return ghRequest(token, '/user');
}

async function getGitHubInstallationsFromToken(token) {
  const payload = await ghRequest(token, '/user/installations');
  return Array.isArray(payload.installations) ? payload.installations : [];
}

function pickInstallationForUser(installations, userLogin) {
  const lowerLogin = String(userLogin || '').toLowerCase();
  return installations.find((installation) => {
    const accountLogin = String(installation?.account?.login || '').toLowerCase();
    return accountLogin === lowerLogin;
  }) || installations[0] || null;
}

async function uploadFileToRepo(token, owner, repo, branch, filePath, content, encoding) {
  const encodedPath = filePath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  let existingSha = null;
  const readResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (readResponse.ok) {
    const existingPayload = await readResponse.json();
    existingSha = existingPayload?.sha || null;
  } else if (readResponse.status !== 404) {
    const errorText = await readResponse.text();
    throw new Error(`Failed to check existing file ${filePath}: ${errorText || readResponse.status}`);
  }

  const payload = {
    message: `chore: add ${filePath}`,
    branch,
    content: encoding === 'binary'
      ? Buffer.from(content).toString('base64')
      : Buffer.from(content, 'utf8').toString('base64')
  };

  if (existingSha) {
    payload.sha = existingSha;
  }

  return ghRequest(token, `/repos/${owner}/${repo}/contents/${encodedPath}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

async function createRepositoryAndDeployTheme(token, userLogin, params) {
  const theme = params.theme;
  const repositoryName = normalizeRepoName(params.repositoryName);
  const privateRepo = Boolean(params.privateRepo);
  const resumeData = params.resumeData;

  if (!validateTheme(theme)) {
    throw new Error('Invalid theme selection.');
  }

  if (!repositoryName) {
    throw new Error('Repository name is required.');
  }

  let repo;
  let reusedExistingRepo = false;
  try {
    repo = await ghRequest(token, '/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name: repositoryName,
        private: privateRepo,
        auto_init: true,
        description: `Portfolio site generated from ${theme} theme`
      })
    });
  } catch (error) {
    // For GitHub App user tokens, repository creation can fail for permission/scope reasons.
    // Try to reuse an existing repo with the same name before failing.
    const shouldTryExistingRepo = [403, 409, 422].includes(error.status);
    if (shouldTryExistingRepo) {
      try {
        repo = await ghRequest(token, `/repos/${userLogin}/${repositoryName}`, {
          method: 'GET'
        });
        reusedExistingRepo = true;
      } catch (_repoLookupError) {
        const detailedError = new Error(
          `Repository creation failed: ${error.message}. ` +
          'If the repository already exists, ensure the GitHub App is installed on it. ' +
          'If it does not exist, grant the app repository Administration (write) and install it for all repositories or create the repo manually first.'
        );
        detailedError.status = error.status || 400;
        throw detailedError;
      }
    } else {
      throw error;
    }
  }

  const branch = repo.default_branch || 'main';
  if (resumeData !== undefined) {
    const validationResult = await validateResumeData(resumeData);
    if (!validationResult.valid) {
      const firstErrors = validationResult.errors.slice(0, 3).join('; ');
      throw new Error(`Uploaded resume JSON is invalid: ${firstErrors || 'schema validation failed'}`);
    }
  }

  const files = await buildThemeBundle(theme, resumeData);

  for (const file of files) {
    await uploadFileToRepo(token, userLogin, repositoryName, branch, file.path, file.content, file.encoding);
  }

  try {
    await ghRequest(token, `/repos/${userLogin}/${repositoryName}/pages`, {
      method: 'POST',
      body: JSON.stringify({
        build_type: 'workflow'
      })
    });
  } catch (_error) {
    // Ignore if the repository already has Pages enabled or endpoint behavior differs.
  }

  const pagesUrl = `https://${userLogin}.github.io/${repositoryName}/`;

  return {
    repositoryUrl: repo.html_url,
    pagesUrl,
    repoFullName: repo.full_name,
    reusedExistingRepo
  };
}

app.get('/auth/github/start', (req, res) => {
  if (!requireGitHubAppConfig(res)) return;

  const state = crypto.randomBytes(18).toString('hex');
  const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/';

  setCookie(res, OAUTH_STATE_COOKIE, state, { secure: process.env.NODE_ENV === 'production', maxAge: 600 });
  setCookie(res, OAUTH_RETURN_COOKIE, returnTo, { secure: process.env.NODE_ENV === 'production', maxAge: 600 });

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', GITHUB_APP_CLIENT_ID);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('allow_signup', 'true');

  res.redirect(authUrl.toString());
});

app.get('/auth/github/callback', async (req, res) => {
  if (!requireGitHubAppConfig(res)) return;

  const { code, state, setup_action: setupAction, installation_id: installationId } = req.query;
  const cookies = parseCookies(req);

  const savedState = cookies[OAUTH_STATE_COOKIE];
  const returnTo = cookies[OAUTH_RETURN_COOKIE] || '/';

  clearCookie(res, OAUTH_STATE_COOKIE);
  clearCookie(res, OAUTH_RETURN_COOKIE);

  const isInstallCallback = Boolean(installationId) || setupAction === 'install' || setupAction === 'update';
  const hasValidState = Boolean(code) && Boolean(state) && Boolean(savedState) && state === savedState;
  const allowStateLessInstallCallback = Boolean(code) && isInstallCallback && !savedState;

  if (!hasValidState && !allowStateLessInstallCallback) {
    res.status(400).send('Invalid OAuth state. Please try connecting again.');
    return;
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: GITHUB_APP_CLIENT_ID,
        client_secret: GITHUB_APP_CLIENT_SECRET,
        code,
        state
      })
    });

    const tokenPayload = await tokenResponse.json();

    if (!tokenResponse.ok || tokenPayload.error || !tokenPayload.access_token) {
      const message = tokenPayload.error_description || tokenPayload.error || 'GitHub App user token exchange failed.';
      res.status(400).send(message);
      return;
    }

    const userToken = tokenPayload.access_token;

    setCookie(res, OAUTH_TOKEN_COOKIE, userToken, {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 4
    });

    const redirectUrl = new URL(returnTo, `http://localhost:${PORT}`);
    redirectUrl.searchParams.set('connected', '1');

    res.redirect(redirectUrl.pathname + redirectUrl.search);
  } catch (error) {
    res.status(500).send(`OAuth callback failed: ${error.message}`);
  }
});

app.get('/api/github/me', async (req, res) => {
  const token = parseCookies(req)[OAUTH_TOKEN_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'Not connected' });
    return;
  }

  try {
    const user = await getGitHubUserFromToken(token);
    const installations = await getGitHubInstallationsFromToken(token);
    const chosenInstallation = pickInstallationForUser(installations, user.login);

    res.json({
      user: {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url
      },
      githubApp: {
        installed: Boolean(chosenInstallation),
        installationId: chosenInstallation ? chosenInstallation.id : null,
        installUrl: GITHUB_APP_INSTALL_URL || null
      }
    });
  } catch (error) {
    if (error.status === 401) {
      clearCookie(res, OAUTH_TOKEN_COOKIE);
    }
    res.status(401).json({ error: 'GitHub session expired. Please reconnect.' });
  }
});

app.post('/api/github/logout', (req, res) => {
  clearCookie(res, OAUTH_TOKEN_COOKIE);
  res.status(204).end();
});

app.post('/api/resume/validate', async (req, res) => {
  try {
    const resumeData = req.body && req.body.resumeData;
    const validationResult = await validateResumeData(resumeData);
    if (!validationResult.valid) {
      res.status(400).json(validationResult);
      return;
    }

    res.json({ valid: true, errors: [] });
  } catch (error) {
    res.status(500).json({
      valid: false,
      errors: [error.message || 'Unable to validate resume JSON']
    });
  }
});

app.post('/api/github/deploy', async (req, res) => {
  const token = parseCookies(req)[OAUTH_TOKEN_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'Connect GitHub first.' });
    return;
  }

  try {
    const me = await getGitHubUserFromToken(token);
    const installations = await getGitHubInstallationsFromToken(token);
    const chosenInstallation = pickInstallationForUser(installations, me.login);
    if (!chosenInstallation) {
      const installHint = GITHUB_APP_INSTALL_URL
        ? `Install the app first: ${GITHUB_APP_INSTALL_URL}`
        : 'Install the GitHub App for your account/repository and try again.';
      throw new Error(`GitHub App is not installed for this account. ${installHint}`);
    }

    const deployResult = await createRepositoryAndDeployTheme(token, me.login, req.body || {});
    res.json({
      ...deployResult,
      installationId: chosenInstallation.id
    });
  } catch (error) {
    const code = error.status && Number.isInteger(error.status) ? error.status : 400;
    res.status(code).json({ error: error.message || 'Deployment failed.' });
  }
});

app.use(express.static(ROOT_DIR, { extensions: ['html'] }));

app.get('/*splat', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
