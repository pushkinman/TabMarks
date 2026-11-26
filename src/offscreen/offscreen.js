// Offscreen document: rasterizes SVG favicons (service workers can't decode SVG).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'tm:rasterize') return false;
  const size = msg.size || 64;
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      c.getContext('2d').drawImage(img, 0, 0, size, size);
      sendResponse({ dataUrl: c.toDataURL('image/png') });
    } catch {
      sendResponse({ dataUrl: null });
    }
  };
  img.onerror = () => sendResponse({ dataUrl: null });
  img.src = msg.src;
  return true;
});
