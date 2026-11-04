import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';

import type { Profile } from './profile.model';
import { PROFILE_STORAGE } from './profile.storage';

interface ProfileState {
  profile: Profile | null;
}

/** Estado global del perfil. Cada cambio se persiste en el dispositivo. */
export const ProfileStore = signalStore(
  { providedIn: 'root' },
  withState<ProfileState>({ profile: null }),
  withComputed(({ profile }) => ({
    hasProfile: computed(() => profile() !== null),
    greetingName: computed(() => profile()?.name.trim() ?? ''),
  })),
  withMethods((store, storage = inject(PROFILE_STORAGE)) => ({
    save(profile: Profile): void {
      storage.save(profile);
      patchState(store, { profile });
    },
    update(changes: Partial<Profile>): void {
      const current = store.profile();
      if (!current) return;
      const next = { ...current, ...changes };
      storage.save(next);
      patchState(store, { profile: next });
    },
    clear(): void {
      storage.clear();
      patchState(store, { profile: null });
    },
  })),
  withHooks({
    onInit(store, storage = inject(PROFILE_STORAGE)) {
      patchState(store, { profile: storage.load() });
    },
  }),
);

/** Perfil de ejemplo para recorrer la app en desarrollo. */
export const DEMO_PROFILE: Profile = {
  name: '',
  sex: 'male',
  ageYears: 30,
  heightCm: 175,
  weightKg: 80,
  activity: 'moderate',
  goal: 'cut',
  pace: 'steady',
  targetWeightKg: 74,
  diet: 'omnivore',
  restrictions: [],
  mealsPerDay: 4,
  units: 'metric',
};
