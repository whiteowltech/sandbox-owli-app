# Owli — app

App de Owli: nutrición predictiva con registro por foto, voz o a mano, y sugerencias para cerrar el día. Ionic + Angular (Standalone Components, Signal Store) y Capacitor para iOS y Android.

La API (Go) vive en su propio repositorio. En desarrollo la app la espera en `http://localhost:8080`.

## Comandos

```bash
npm install
npx ng serve --port 8100        # http://localhost:8100 (en desarrollo hay un botón de perfil de prueba)
npx ng test --watch=false       # pruebas unitarias (Vitest)
npm run lint                    # ESLint + Prettier (prefijo de componentes: owli-)
npx ng build                    # compilación de producción en www/
```

## Configuración

La URL de la API está en `src/environments/`:

| Archivo | Uso | API |
|---|---|---|
| `environment.ts` | desarrollo (`ng serve`) | `http://localhost:8080` |
| `environment.e2e.ts` | pruebas de punta a punta | `http://localhost:8090` |
| `environment.prod.ts` | producción | URL de Railway (provisional) |

La app no guarda secretos: la sesión es un JWT que entrega la API.

## Convenciones

- **Estado:** Signal Store (`@ngrx/signals`), en `src/app/core/`.
- **Textos:** Transloco, en `src/assets/i18n/{es,en}.json`. Nunca hay texto fijo en los componentes.
- **Tema:** `src/theme/variables.scss` (tokens `--owli-*`). Modo oscuro siempre, estilo iOS en las dos plataformas.
- **Cálculos replicados del backend:** `core/nutrition/plan.ts` y `macros.ts` repiten las reglas del dominio para mostrarlas en vivo. Se prueban con los mismos casos que el backend. Si cambia una regla, cambian los dos lados.

## Voz

La voz se transcribe primero en el dispositivo: Web Speech API en el navegador y, en la app nativa, el plugin de Capacitor. Es gratis y muestra el texto mientras se habla. Si el dispositivo no puede transcribir, la app graba el audio y lo transcribe la API (Whisper en Groq). El audio nunca se guarda.
