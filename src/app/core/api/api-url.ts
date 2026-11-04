import { InjectionToken } from '@angular/core';

import { environment } from '../../../environments/environment';

/** URL base de la API de Owli (sin barra final). Inyectable para poder cambiarla en tests. */
export const API_URL = new InjectionToken<string>('API_URL', {
  providedIn: 'root',
  factory: () => environment.apiUrl,
});
