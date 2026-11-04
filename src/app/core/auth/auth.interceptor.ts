import { HttpErrorResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { API_URL } from '../api/api-url';

import { AuthService } from './auth.service';

/**
 * Adjunta el access token a los pedidos a la API de Owli. Si el servidor
 * responde 401 (token vencido justo en vuelo), renueva una vez y reintenta.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const apiUrl = inject(API_URL);
  if (!req.url.startsWith(apiUrl) || req.url.startsWith(`${apiUrl}/v1/auth/`)) return next(req);
  const auth = inject(AuthService);

  const withToken = (r: HttpRequest<unknown>, token: string | null) =>
    token ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : r;

  return from(auth.accessToken()).pipe(
    switchMap((token) => next(withToken(req, token))),
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || !auth.session()) return throwError(() => err);
      return from(auth.refresh()).pipe(switchMap((s) => next(withToken(req, s.accessToken))));
    }),
  );
};
