// Producción (sandbox): la API en Railway. La app se publica en Cloudflare Pages
// (sandbox-owli-app.pages.dev), que debe estar en CORS_ALLOWED_ORIGINS de la API.
export const environment = {
  production: true,
  apiUrl: 'https://sandbox-owli-backend-production.up.railway.app',
};
