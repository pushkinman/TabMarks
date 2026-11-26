// Vector symbols drawn on a 24x24 grid, scaled to any size.
// "shape" symbols are filled with the mark color.
// "glyph" symbols draw a white glyph on a colored rounded tile so they stay
// readable at favicon size.

export const SYMBOLS = [
  { id: 'circle', name: 'Circle', kind: 'shape', text: '●' },
  { id: 'square', name: 'Square', kind: 'shape', text: '■' },
  { id: 'diamond', name: 'Diamond', kind: 'shape', text: '◆' },
  { id: 'star', name: 'Star', kind: 'shape', text: '★' },
  { id: 'heart', name: 'Heart', kind: 'shape', text: '♥' },
  { id: 'bookmark', name: 'Bookmark', kind: 'shape', text: '🔖' },
  { id: 'pr', name: 'Pull request', kind: 'glyph', text: '⤴' },
  { id: 'merge', name: 'Merge', kind: 'glyph', text: '🔀' },
  { id: 'eye', name: 'Review', kind: 'glyph', text: '👁' },
  { id: 'check', name: 'Check', kind: 'glyph', text: '✔' },
  { id: 'cross', name: 'Cross', kind: 'glyph', text: '✖' },
  { id: 'hourglass', name: 'Hourglass', kind: 'glyph', text: '⏳' },
  { id: 'comment', name: 'Comment', kind: 'glyph', text: '💬' },
  { id: 'bug', name: 'Bug', kind: 'glyph', text: '🐛' },
  { id: 'flame', name: 'Flame', kind: 'glyph', text: '🔥' },
  { id: 'lock', name: 'Blocked', kind: 'glyph', text: '🔒' },
  { id: 'rocket', name: 'Rocket', kind: 'glyph', text: '🚀' },
  { id: 'flag', name: 'Flag', kind: 'glyph', text: '🚩' },
];

export function symbolById(id) {
  return SYMBOLS.find((s) => s.id === id) || SYMBOLS[0];
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function starPath(ctx, cx, cy, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const SHAPES = {
  circle(ctx) {
    ctx.beginPath();
    ctx.arc(12, 12, 10.5, 0, Math.PI * 2);
    ctx.fill();
  },
  square(ctx) {
    roundRect(ctx, 2.5, 2.5, 19, 19, 4);
    ctx.fill();
  },
  diamond(ctx) {
    ctx.beginPath();
    ctx.moveTo(12, 1.5);
    ctx.lineTo(22.5, 12);
    ctx.lineTo(12, 22.5);
    ctx.lineTo(1.5, 12);
    ctx.closePath();
    ctx.fill();
  },
  star(ctx) {
    starPath(ctx, 12, 12.8, 11.5, 5);
    ctx.fill();
  },
  heart(ctx) {
    ctx.beginPath();
    ctx.moveTo(12, 21.5);
    ctx.bezierCurveTo(5, 16.5, 1.5, 12.5, 1.5, 8.3);
    ctx.bezierCurveTo(1.5, 5.2, 4, 2.5, 7.2, 2.5);
    ctx.bezierCurveTo(9.3, 2.5, 11, 3.7, 12, 5.6);
    ctx.bezierCurveTo(13, 3.7, 14.7, 2.5, 16.8, 2.5);
    ctx.bezierCurveTo(20, 2.5, 22.5, 5.2, 22.5, 8.3);
    ctx.bezierCurveTo(22.5, 12.5, 19, 16.5, 12, 21.5);
    ctx.closePath();
    ctx.fill();
  },
  bookmark(ctx) {
    ctx.beginPath();
    ctx.moveTo(4.5, 1.5);
    ctx.lineTo(19.5, 1.5);
    ctx.lineTo(19.5, 22.5);
    ctx.lineTo(12, 16.5);
    ctx.lineTo(4.5, 22.5);
    ctx.closePath();
    ctx.fill();
  },
};

function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Glyphs draw in white on top of an already-filled tile.
const GLYPHS = {
  pr(ctx) {
    dot(ctx, 7.5, 5.5, 2.4);
    dot(ctx, 7.5, 18.5, 2.4);
    dot(ctx, 16.5, 18.5, 2.4);
    ctx.beginPath();
    ctx.moveTo(7.5, 7.5);
    ctx.lineTo(7.5, 16.5);
    ctx.moveTo(16.5, 16.5);
    ctx.lineTo(16.5, 10);
    ctx.quadraticCurveTo(16.5, 7, 13.5, 7);
    ctx.lineTo(11, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(13, 4.3);
    ctx.lineTo(10.3, 7);
    ctx.lineTo(13, 9.7);
    ctx.stroke();
  },
  merge(ctx) {
    dot(ctx, 7.5, 5.5, 2.4);
    dot(ctx, 7.5, 18.5, 2.4);
    dot(ctx, 17, 13, 2.4);
    ctx.beginPath();
    ctx.moveTo(7.5, 7.5);
    ctx.lineTo(7.5, 16.5);
    ctx.moveTo(7.5, 8);
    ctx.quadraticCurveTo(8.5, 13, 15, 13);
    ctx.stroke();
  },
  eye(ctx) {
    ctx.beginPath();
    ctx.moveTo(2.5, 12);
    ctx.quadraticCurveTo(12, 1.5, 21.5, 12);
    ctx.quadraticCurveTo(12, 22.5, 2.5, 12);
    ctx.closePath();
    ctx.stroke();
    dot(ctx, 12, 12, 3.3);
  },
  check(ctx) {
    ctx.beginPath();
    ctx.moveTo(5.5, 12.5);
    ctx.lineTo(10, 17);
    ctx.lineTo(18.5, 7.5);
    ctx.stroke();
  },
  cross(ctx) {
    ctx.beginPath();
    ctx.moveTo(7, 7);
    ctx.lineTo(17, 17);
    ctx.moveTo(17, 7);
    ctx.lineTo(7, 17);
    ctx.stroke();
  },
  hourglass(ctx) {
    ctx.beginPath();
    ctx.moveTo(6.5, 4);
    ctx.lineTo(17.5, 4);
    ctx.moveTo(6.5, 20);
    ctx.lineTo(17.5, 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, 5);
    ctx.lineTo(16, 5);
    ctx.lineTo(12, 12);
    ctx.closePath();
    ctx.moveTo(12, 12);
    ctx.lineTo(16, 19);
    ctx.lineTo(8, 19);
    ctx.closePath();
    ctx.fill();
  },
  comment(ctx) {
    roundRect(ctx, 3.5, 4, 17, 12, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(7.5, 15);
    ctx.lineTo(7, 20.5);
    ctx.lineTo(12.5, 15);
    ctx.closePath();
    ctx.fill();
  },
  bug(ctx) {
    ctx.beginPath();
    ctx.ellipse(12, 14, 5, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    dot(ctx, 12, 6, 2.8);
    ctx.beginPath();
    ctx.moveTo(7, 11);
    ctx.lineTo(3.5, 9);
    ctx.moveTo(6.5, 14.5);
    ctx.lineTo(3, 14.5);
    ctx.moveTo(7, 18);
    ctx.lineTo(4, 20.5);
    ctx.moveTo(17, 11);
    ctx.lineTo(20.5, 9);
    ctx.moveTo(17.5, 14.5);
    ctx.lineTo(21, 14.5);
    ctx.moveTo(17, 18);
    ctx.lineTo(20, 20.5);
    ctx.stroke();
  },
  flame(ctx) {
    ctx.beginPath();
    ctx.moveTo(12.5, 2.5);
    ctx.bezierCurveTo(19, 8.5, 20, 13, 18, 17);
    ctx.bezierCurveTo(16, 21.5, 8, 21.5, 6, 17);
    ctx.bezierCurveTo(4.5, 13.5, 7, 10.5, 9, 7.5);
    ctx.bezierCurveTo(9.5, 10, 10.5, 11, 11.5, 11);
    ctx.bezierCurveTo(12.5, 8, 13, 5.5, 12.5, 2.5);
    ctx.closePath();
    ctx.fill();
  },
  lock(ctx) {
    roundRect(ctx, 5, 10.5, 14, 10.5, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, 10.5);
    ctx.lineTo(8, 8);
    ctx.arc(12, 8, 4, Math.PI, 0);
    ctx.lineTo(16, 10.5);
    ctx.stroke();
  },
  rocket(ctx) {
    ctx.beginPath();
    ctx.moveTo(12, 2);
    ctx.bezierCurveTo(16.5, 5.5, 16.5, 12, 15.2, 16.5);
    ctx.lineTo(8.8, 16.5);
    ctx.bezierCurveTo(7.5, 12, 7.5, 5.5, 12, 2);
    ctx.closePath();
    ctx.moveTo(8.7, 11.5);
    ctx.lineTo(5, 18.5);
    ctx.lineTo(9, 16.5);
    ctx.closePath();
    ctx.moveTo(15.3, 11.5);
    ctx.lineTo(19, 18.5);
    ctx.lineTo(15, 16.5);
    ctx.closePath();
    ctx.moveTo(10.3, 18);
    ctx.lineTo(13.7, 18);
    ctx.lineTo(12, 22);
    ctx.closePath();
    ctx.fill();
  },
  flag(ctx) {
    ctx.beginPath();
    ctx.moveTo(6, 3);
    ctx.lineTo(6, 21.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6.5, 3.5);
    ctx.lineTo(19, 3.5);
    ctx.lineTo(15.5, 8.5);
    ctx.lineTo(19, 13.5);
    ctx.lineTo(6.5, 13.5);
    ctx.closePath();
    ctx.fill();
  },
};

/**
 * Draw a symbol into a box.
 * @param ctx  CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D
 * @param id   symbol id
 * @param x,y,size  box in canvas pixels
 * @param fill  fill style (color string or gradient)
 */
export function drawSymbol(ctx, id, x, y, size, fill) {
  const sym = symbolById(id);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (sym.kind === 'shape') {
    ctx.fillStyle = fill;
    SHAPES[sym.id](ctx);
  } else {
    ctx.fillStyle = fill;
    roundRect(ctx, 0, 0, 24, 24, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.6;
    // Draw glyph slightly inset so strokes don't touch the tile edge.
    ctx.translate(2, 2);
    ctx.scale(20 / 24, 20 / 24);
    GLYPHS[sym.id](ctx);
  }
  ctx.restore();
}
