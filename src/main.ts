import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  PreloadAllModules,
  RouteReuseStrategy,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
} from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { authInterceptor } from './app/core/auth/auth.interceptor';
import { provideOwliI18n } from './app/core/i18n/transloco';
import { ProfileSyncService } from './app/core/profile/profile-sync.service';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    // Owli es siempre oscuro y usa el estilo iOS en ambas plataformas para verse igual.
    provideIonicAngular({ mode: 'ios' }),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideOwliI18n(),
    // Si el perfil no se pudo subir (sin conexión), se reintenta al abrir la app, sin bloquearla.
    provideAppInitializer(() => {
      void inject(ProfileSyncService).retryIfPending();
    }),
  ],
});
