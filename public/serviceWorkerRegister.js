if ('serviceWorker' in navigator) {
  window._SW_ENABLED = false;

  const syncServiceWorkerEnabledState = function () {
    const controlled = !!navigator.serviceWorker.controller;
    window._SW_ENABLED = controlled;
    console.log('ServiceWorker controlled state: ', controlled);
  };

  window.addEventListener('DOMContentLoaded', function () {
    syncServiceWorkerEnabledState();

    navigator.serviceWorker.register('/serviceWorker.js').then(function (registration) {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
      const sw = registration.installing || registration.waiting
      if (sw) {
        sw.onstatechange = function() {
          if (sw.state === 'installed') {
            // SW installed.  Reload for SW intercept serving SW-enabled page.
            console.log('ServiceWorker installed reload page');
            window.location.reload();
          }
        }
      }
      registration.update().then(res => {
        console.log('ServiceWorker registration update: ', res);
      });
      navigator.serviceWorker.ready
        .then(syncServiceWorkerEnabledState)
        .catch(function (err) {
          console.error('ServiceWorker ready failed: ', err);
        });
    }, function (err) {
      window._SW_ENABLED = false;
      console.error('ServiceWorker registration failed: ', err);
    });
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      syncServiceWorkerEnabledState();
      console.log('ServiceWorker controllerchange ');
      window.location.reload();
    });
  });
}
