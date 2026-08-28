import { TestBed } from '@angular/core/testing';
import { ConnectivityService } from './connectivity.service';

describe('ConnectivityService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('reacts to browser connectivity changes', () => {
    const service = TestBed.inject(ConnectivityService);

    window.dispatchEvent(new Event('offline'));
    expect(service.online()).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(service.online()).toBe(true);
  });
});
