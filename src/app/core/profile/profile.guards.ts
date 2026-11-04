import { inject } from '@angular/core';
import { Router, type CanMatchFn } from '@angular/router';

import { ProfileStore } from './profile.store';

/** Sin perfil no hay día que mostrar: se va al onboarding. */
export const requireProfile: CanMatchFn = () =>
  inject(ProfileStore).hasProfile() || inject(Router).parseUrl('/onboarding');

/** Quien ya tiene perfil no vuelve a ver el onboarding al abrir la app. */
export const requireNoProfile: CanMatchFn = () =>
  !inject(ProfileStore).hasProfile() || inject(Router).parseUrl('/today');
