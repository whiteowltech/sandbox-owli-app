import type { Routes } from '@angular/router';

import { requireNoProfile, requireProfile } from './core/profile/profile.guards';

export const routes: Routes = [
  {
    path: 'onboarding',
    canMatch: [requireNoProfile],
    loadComponent: () => import('./features/onboarding/onboarding.page').then((m) => m.OnboardingPage),
  },
  {
    path: 'today',
    canMatch: [requireProfile],
    loadComponent: () => import('./features/today/today.page').then((m) => m.TodayPage),
  },
  {
    path: 'week',
    canMatch: [requireProfile],
    loadComponent: () => import('./features/week/week.page').then((m) => m.WeekPage),
  },
  {
    path: 'account',
    canMatch: [requireProfile],
    loadComponent: () => import('./features/account/account.page').then((m) => m.AccountPage),
  },
  { path: '', redirectTo: 'today', pathMatch: 'full' },
  { path: '**', redirectTo: 'today' },
];
