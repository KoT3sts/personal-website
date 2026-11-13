// Cookieless page counts with GoatCounter (cesartortolero.goatcounter.com).
// One request per page view: the path, the title, the referring site and the screen width.
// No cookies or local storage, nothing stored on the device, and no IP address kept by
// GoatCounter. Only the production domain counts; local previews and automated browsers do not.
const ENDPOINT = 'https://cesartortolero.goatcounter.com/count';

if (location.hostname === 'cesartortolero.com' && !navigator.webdriver && typeof navigator.sendBeacon === 'function') {
  const params = new URLSearchParams({
    p: location.pathname,
    t: document.title,
    r: document.referrer,
    s: String(window.screen?.width || ''),
    rnd: Math.random().toString(36).slice(2),
  });
  navigator.sendBeacon(`${ENDPOINT}?${params}`);
}
