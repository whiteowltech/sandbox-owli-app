import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree, type Route } from '@angular/router';

import { requireNoProfile, requireProfile } from './profile.guards';
import type { Profile } from './profile.model';
import { PROFILE_STORAGE, type ProfileStorage } from './profile.storage';
import { DEMO_PROFILE, ProfileStore } from './profile.store';

class MemoryStorage implements ProfileStorage {
  constructor(public stored: Profile | null = null) {}
  load() {
    return this.stored;
  }
  save(p: Profile) {
    this.stored = p;
  }
  clear() {
    this.stored = null;
  }
}

function setup(initial: Profile | null = null) {
  const storage = new MemoryStorage(initial);
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: PROFILE_STORAGE, useValue: storage }],
  });
  return { store: TestBed.inject(ProfileStore), storage };
}

function runGuard(guard: typeof requireProfile) {
  return TestBed.runInInjectionContext(() => guard({} as Route, [], {} as Parameters<typeof requireProfile>[2]));
}

describe('ProfileStore', () => {
  it('carga el perfil guardado al iniciar', () => {
    const { store } = setup({ ...DEMO_PROFILE, name: 'Leandro' });
    expect(store.hasProfile()).toBe(true);
    expect(store.greetingName()).toBe('Leandro');
  });

  it('persiste cada cambio en el dispositivo', () => {
    const { store, storage } = setup();
    expect(store.hasProfile()).toBe(false);

    store.save(DEMO_PROFILE);
    expect(storage.stored?.diet).toBe('omnivore');

    store.update({ diet: 'keto', restrictions: ['gluten_free'] });
    expect(store.profile()?.diet).toBe('keto');
    expect(storage.stored?.restrictions).toEqual(['gluten_free']);

    store.clear();
    expect(store.hasProfile()).toBe(false);
    expect(storage.stored).toBeNull();
  });

  it('update sin perfil no crea uno a medias', () => {
    const { store, storage } = setup();
    store.update({ diet: 'vegan' });
    expect(store.profile()).toBeNull();
    expect(storage.stored).toBeNull();
  });
});

describe('guards de perfil', () => {
  it('sin perfil, Hoy redirige al onboarding', () => {
    setup();
    const result = runGuard(requireProfile);
    expect(result instanceof UrlTree && TestBed.inject(Router).serializeUrl(result)).toBe('/onboarding');
    expect(runGuard(requireNoProfile)).toBe(true);
  });

  it('con perfil, el onboarding redirige a Hoy', () => {
    setup(DEMO_PROFILE);
    expect(runGuard(requireProfile)).toBe(true);
    const result = runGuard(requireNoProfile);
    expect(result instanceof UrlTree && TestBed.inject(Router).serializeUrl(result)).toBe('/today');
  });
});
