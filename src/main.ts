import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

if (new URLSearchParams(window.location.search).get('debug') === 'true') {
  void import('eruda')
    .then(({ default: eruda }) => {
      eruda.init();
      console.info('[AI]', 'Eruda enabled by ?debug=true');
    })
    .catch((error: unknown) => console.error('[AI]', 'Eruda could not be loaded', error));
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
