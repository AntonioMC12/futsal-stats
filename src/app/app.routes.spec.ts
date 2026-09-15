import { Type } from '@angular/core';
import { routes } from './app.routes';

describe('application routes', () => {
  it('lazy-loads the strategies page and keeps the RFEF route available directly', async () => {
    const strategiesRoute = routes.find(({ path }) => path === 'strategies');
    const regulationsRoute = routes.find(({ path }) => path === 'reglamento-rfef');

    expect(strategiesRoute?.loadComponent).toBeTypeOf('function');
    expect(regulationsRoute?.loadComponent).toBeTypeOf('function');
    const loadedComponent = await (strategiesRoute?.loadComponent?.() as Promise<Type<unknown>>);
    expect(loadedComponent.name).toMatch(/StrategiesPage$/);
  });

  it('protects device administration and invitation consumption routes', () => {
    const devicesRoute = routes.find(({ path }) => path === 'settings/devices');
    const joinRoute = routes.find(({ path }) => path === 'join');

    expect(devicesRoute?.canActivate).toHaveLength(3);
    expect(devicesRoute?.loadComponent).toBeTypeOf('function');
    expect(joinRoute?.canActivate).toHaveLength(1);
    expect(joinRoute?.loadComponent).toBeTypeOf('function');
  });
});
