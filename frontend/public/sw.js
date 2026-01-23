// Service Worker de limpieza - se auto-desregistra
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  // Desregistrar este service worker
  self.registration.unregister().then(() => {
    console.log('Service Worker desregistrado');
  });
  
  // Limpiar todos los caches
  caches.keys().then(names => {
    names.forEach(name => {
      caches.delete(name);
    });
  });
});
