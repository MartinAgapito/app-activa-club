// CloudFront Function (viewer-request) asociada únicamente al
// default_cache_behavior (origen S3 del SPA) — nunca al behavior "/api/*".
//
// Reemplaza el enfoque anterior de custom_error_response (403/404 -> 200
// index.html a nivel de distribución completa): ese enfoque interceptaba
// también los 403/404 legítimos de la API (FORBIDDEN, NOT_FOUND,
// DNI_NOT_FOUND — ver apps/api/src/lib/errors.ts), devolviéndolos como
// "200 + index.html" en vez del error real, y además CloudFront cachea esas
// respuestas de error por varios minutos (error_caching_min_ttl, default
// 300s), lo que podía bloquear a cualquier usuario con un token válido
// pegándole a la misma ruta durante ese tiempo.
//
// Con esta función, el SPA sigue soportando rutas del lado del cliente
// (React Router) sin depender de ningún error del origen: cualquier ruta
// sin extensión de archivo (sin ".") se reescribe a /index.html *antes* de
// llegar a S3, y el comportamiento "/api/*" nunca pasa por acá.
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri.indexOf('.') === -1) {
    request.uri = '/index.html';
  }

  return request;
}
