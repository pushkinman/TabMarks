// Draws a marked favicon. Works with both <canvas> (popup previews) and
// OffscreenCanvas (service worker).

import { drawSymbol } from './symbols.js';

export const FAVICON_SIZE = 32;
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

export function makeFill(ctx, color, x, y, w, h) {
  if (!color) return '#8b8d98';
  if (color.gradient) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, color.gradient[0]);
    g.addColorStop(1, color.gradient[1]);
    return g;
  }
  return color.value;
}

function drawSource(ctx, src, x, y, size) {
  if (src.bitmap) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src.bitmap, x, y, size, size);
    return;
  }
  // Letter placeholder
  ctx.fillStyle = '#8b8d98';
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${Math.round(size * 0.6)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((src.letter || '•').toUpperCase(), x + size / 2, y + size / 2 + size * 0.04);
}

/**
 * @param ctx 2D context of a SxS canvas (cleared by caller)
 * @param opts {bitmap?, letter?, color?, style, symbol, emoji?}
 */
export function drawMarkedIcon(ctx, opts, S = FAVICON_SIZE) {
  const { color, style, symbol, emoji } = opts;
  ctx.clearRect(0, 0, S, S);
  switch (style) {
    case 'halo': {
      ctx.fillStyle = makeFill(ctx, color, 0, 0, S, S);
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S * 0.38, 0, Math.PI * 2);
      ctx.fill();
      const inner = Math.round(S * 0.6);
      drawSource(ctx, opts, (S - inner) / 2, (S - inner) / 2, inner);
      break;
    }
    case 'tint': {
      drawSource(ctx, opts, 0, 0, S);
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = makeFill(ctx, color, 0, 0, S, S);
      ctx.fillRect(0, 0, S, S);
      ctx.restore();
      break;
    }
    case 'badge': {
      drawSource(ctx, opts, 0, 0, S);
      const r = S * 0.24;
      const cx = S - r - 0.5;
      const cy = S - r - 0.5;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, cy, r + S * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = makeFill(ctx, color, cx - r, cy - r, r * 2, r * 2);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'emoji': {
      drawSource(ctx, opts, 0, 0, S);
      const r = S * 0.3;
      const cx = S - r;
      const cy = S - r;
      ctx.fillStyle = color ? makeFill(ctx, color, cx - r, cy - r, r * 2, r * 2) : '#fff';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${Math.round(r * 1.45)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji || '•', cx, cy + r * 0.08);
      break;
    }
    case 'symbol': {
      drawSymbol(ctx, symbol, 0, 0, S, makeFill(ctx, color, 0, 0, S, S));
      break;
    }
    default:
      drawSource(ctx, opts, 0, 0, S);
  }
}

function bytesToBase64(bytes) {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export async function blobToDataURL(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${blob.type || 'image/png'};base64,${bytesToBase64(bytes)}`;
}

/** Render to a PNG data URL using OffscreenCanvas. */
export async function renderFaviconDataURL(opts) {
  const canvas = new OffscreenCanvas(FAVICON_SIZE, FAVICON_SIZE);
  drawMarkedIcon(canvas.getContext('2d'), opts, FAVICON_SIZE);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blobToDataURL(blob);
}
