import { HttpClient } from '@angular/common/http';
import { inject, Injectable, isDevMode, type EnvironmentProviders, type Provider } from '@angular/core';
import { provideTransloco, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import type { Observable } from 'rxjs';

export const LANGS = ['es', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'es';

/** Carga las traducciones desde assets/i18n/<idioma>.json. */
@Injectable({ providedIn: 'root' })
export class AssetsTranslocoLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string): Observable<Translation> {
    return this.http.get<Translation>(`assets/i18n/${lang}.json`);
  }
}

/** Idiomas de Owli: español por defecto, cambio en vivo sin recargar. */
export function provideOwliI18n(): (Provider | EnvironmentProviders)[] {
  return provideTransloco({
    config: {
      availableLangs: [...LANGS],
      defaultLang: DEFAULT_LANG,
      fallbackLang: DEFAULT_LANG,
      reRenderOnLangChange: true,
      prodMode: !isDevMode(),
      missingHandler: { logMissingKey: isDevMode() },
    },
    loader: AssetsTranslocoLoader,
  });
}
