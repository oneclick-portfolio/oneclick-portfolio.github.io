const CONFIG = {
  apiBase: 'https://op-bot-mauve.vercel.app',
  // apiBase: 'http://localhost:8080',
  deploy: {
    themeRepoLinks: {
      modern:    'https://github.com/oneclick-portfolio/awesome-github-portfolio/tree/main/themes/modern',
      newspaper: 'https://github.com/oneclick-portfolio/awesome-github-portfolio/tree/main/themes/newspaper',
      graphic:   'https://github.com/oneclick-portfolio/awesome-github-portfolio/tree/main/themes/graphic',
      vscode:    'https://github.com/oneclick-portfolio/awesome-github-portfolio/tree/main/themes/vscode'
    }
  },
  paths: {
    resumeData: '/resume/Reactive Resume.json',
    profileArt: '/src/profile.html',
    faviconSvg: '/favicon.svg',
    faviconIco: '/favicon.ico'
  },
  theme: {
    colors: {
      dark: '#0b0f14',
      light: '#f8f9fa'
    },
    icons: {
      dark: '☾',
      light: '☀'
    }
  },
  storage: {
    theme: 'theme'
  },
  animation: {
    tilt: {
      perspective: '900px',
      range: 8
    }
  },
  errors: {
    resumeLoadError: '<div style="padding: 2rem; text-align: center;"><h1>Error loading resume data</h1><p>Ensure resume/Reactive Resume.json is valid RxResume JSON.</p></div>',
    profileArtNotFound: 'Profile art not found.'
  },
  fallbacks: {
    profileArt: ''
  }
};

// Make CONFIG globally available
window.CONFIG = CONFIG;
