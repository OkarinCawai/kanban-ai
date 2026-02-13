import { deflateSync } from "node:zlib";

import type { CoverSpec } from "@kanban/contracts";

type Palette = {
  bg1: string;
  bg2: string;
  ink: string;
  inkMuted: string;
  accent: string;
  accent2: string;
};

const PALETTES: Record<CoverSpec["palette"], Palette> = {
  slate: {
    bg1: "#0f172a",
    bg2: "#334155",
    ink: "#f8fafc",
    inkMuted: "#cbd5e1",
    accent: "#38bdf8",
    accent2: "#a78bfa"
  },
  sunset: {
    bg1: "#451a03",
    bg2: "#c2410c",
    ink: "#fff7ed",
    inkMuted: "#fed7aa",
    accent: "#fb7185",
    accent2: "#fdba74"
  },
  ocean: {
    bg1: "#082f49",
    bg2: "#155e75",
    ink: "#ecfeff",
    inkMuted: "#a5f3fc",
    accent: "#22d3ee",
    accent2: "#60a5fa"
  },
  forest: {
    bg1: "#052e16",
    bg2: "#166534",
    ink: "#f0fdf4",
    inkMuted: "#bbf7d0",
    accent: "#34d399",
    accent2: "#a3e635"
  },
  citrus: {
    bg1: "#422006",
    bg2: "#a16207",
    ink: "#fffbeb",
    inkMuted: "#fde68a",
    accent: "#facc15",
    accent2: "#fb7185"
  }
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

type BadgeTone = NonNullable<CoverSpec["badges"]>[number]["tone"];

const toneColor = (
  palette: Palette,
  tone: BadgeTone
): string => {
  if (tone === "danger") return "#ef4444";
  if (tone === "warning") return "#f59e0b";
  if (tone === "success") return "#10b981";
  if (tone === "info") return palette.accent;
  return palette.inkMuted;
};

export const renderCoverSvg = (
  spec: CoverSpec,
  options: { width?: number; height?: number } = {}
): { svg: string; width: number; height: number } => {
  const width = Number.isFinite(options.width) ? Math.max(200, Number(options.width)) : 1200;
  const height = Number.isFinite(options.height) ? Math.max(200, Number(options.height)) : 600;
  const palette = PALETTES[spec.palette];
  const title = escapeXml(spec.title.trim());
  const subtitle = spec.subtitle ? escapeXml(spec.subtitle.trim()) : "";

  const badgeRows = (spec.badges ?? []).slice(0, 6);
  const badgeSvg = badgeRows
    .map((badge, index) => {
      const text = escapeXml(badge.text.trim());
      const x = 80 + index * 190;
      const y = height - 140;
      const fill = toneColor(palette, badge.tone);
      const textFill = badge.tone === "neutral" ? palette.bg1 : "#0b1020";
      return [
        `<g transform="translate(${x} ${y})">`,
        `  <rect x="0" y="0" width="170" height="44" rx="22" fill="${fill}" opacity="0.95" />`,
        `  <text x="85" y="29" text-anchor="middle" font-size="20" font-weight="700" fill="${textFill}" font-family="Segoe UI, Arial, sans-serif">${text}</text>`,
        `</g>`
      ].join("\n");
    })
    .join("\n");

  const mosaicDecor = [
    `<rect x="${width - 320}" y="60" width="240" height="240" fill="${palette.accent}" opacity="0.12" />`,
    `<rect x="${width - 260}" y="140" width="240" height="240" fill="${palette.accent2}" opacity="0.12" />`,
    `<rect x="${width - 380}" y="200" width="240" height="240" fill="${palette.ink}" opacity="0.05" />`
  ].join("\n");

  const stampDecor = [
    `<rect x="60" y="60" width="${width - 120}" height="${height - 120}" fill="none" stroke="${palette.inkMuted}" stroke-width="6" opacity="0.45" />`,
    `<circle cx="${width - 190}" cy="170" r="88" fill="${palette.accent}" opacity="0.18" />`,
    `<circle cx="${width - 210}" cy="190" r="88" fill="${palette.accent2}" opacity="0.12" />`
  ].join("\n");

  const blueprintDecor = [
    `<path d="M60 ${height / 2} H ${width - 60}" stroke="${palette.inkMuted}" stroke-width="2" opacity="0.18" />`,
    `<path d="M${width / 2} 60 V ${height - 60}" stroke="${palette.inkMuted}" stroke-width="2" opacity="0.18" />`,
    `<g opacity="0.12" stroke="${palette.inkMuted}" stroke-width="1">`,
    ...Array.from({ length: 18 }).map((_, idx) => {
      const x = 60 + idx * ((width - 120) / 17);
      return `<path d="M${x} 60 V ${height - 60}" />`;
    }),
    ...Array.from({ length: 10 }).map((_, idx) => {
      const y = 60 + idx * ((height - 120) / 9);
      return `<path d="M60 ${y} H ${width - 60}" />`;
    }),
    `</g>`
  ].join("\n");

  const decor =
    spec.template === "mosaic"
      ? mosaicDecor
      : spec.template === "stamp"
        ? stampDecor
        : blueprintDecor;

  const subtitleSvg = subtitle
    ? `<text x="80" y="220" font-size="30" font-weight="600" fill="${palette.inkMuted}" font-family="Segoe UI, Arial, sans-serif">${subtitle}</text>`
    : "";

  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <defs>`,
    `    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">`,
    `      <stop offset="0%" stop-color="${palette.bg1}" />`,
    `      <stop offset="100%" stop-color="${palette.bg2}" />`,
    `    </linearGradient>`,
    `    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">`,
    `      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000000" flood-opacity="0.22" />`,
    `    </filter>`,
    `  </defs>`,
    `  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#bg)" />`,
    `  ${decor}`,
    `  <g filter="url(#softShadow)">`,
    `    <rect x="60" y="80" width="${width - 120}" height="${height - 180}" rx="28" fill="rgba(15, 23, 42, 0.35)" />`,
    `  </g>`,
    `  <text x="80" y="170" font-size="64" font-weight="800" fill="${palette.ink}" font-family="Segoe UI, Arial, sans-serif">${title}</text>`,
    `  ${subtitleSvg}`,
    `  ${badgeSvg}`,
    `</svg>`
  ].join("\n");

  return { svg, width, height };
};

type Rgba = { r: number; g: number; b: number; a: number };

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const parseHexColor = (hex: string): { r: number; g: number; b: number } => {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  const num = Number.parseInt(normalized, 16);
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff
  };
};

const rgbaFromHex = (hex: string, alpha = 255): Rgba => {
  const { r, g, b } = parseHexColor(hex);
  return { r, g, b, a: clampByte(alpha) };
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpColor = (c1: Rgba, c2: Rgba, t: number): Rgba => ({
  r: clampByte(lerp(c1.r, c2.r, t)),
  g: clampByte(lerp(c1.g, c2.g, t)),
  b: clampByte(lerp(c1.b, c2.b, t)),
  a: clampByte(lerp(c1.a, c2.a, t))
});

class RasterCanvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  private index(x: number, y: number): number {
    return (y * this.width + x) * 4;
  }

  setPixel(x: number, y: number, color: Rgba): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }

    const idx = this.index(x, y);
    this.data[idx] = color.r;
    this.data[idx + 1] = color.g;
    this.data[idx + 2] = color.b;
    this.data[idx + 3] = color.a;
  }

  blendPixel(x: number, y: number, color: Rgba): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }

    const idx = this.index(x, y);
    const dstR = this.data[idx];
    const dstG = this.data[idx + 1];
    const dstB = this.data[idx + 2];
    const dstA = this.data[idx + 3] / 255;

    const srcA = color.a / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA <= 0) {
      this.data[idx] = 0;
      this.data[idx + 1] = 0;
      this.data[idx + 2] = 0;
      this.data[idx + 3] = 0;
      return;
    }

    const outR = (color.r * srcA + dstR * dstA * (1 - srcA)) / outA;
    const outG = (color.g * srcA + dstG * dstA * (1 - srcA)) / outA;
    const outB = (color.b * srcA + dstB * dstA * (1 - srcA)) / outA;

    this.data[idx] = clampByte(outR);
    this.data[idx + 1] = clampByte(outG);
    this.data[idx + 2] = clampByte(outB);
    this.data[idx + 3] = clampByte(outA * 255);
  }

  fillRect(x: number, y: number, w: number, h: number, color: Rgba, blend = false): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.floor(x + w));
    const y1 = Math.min(this.height, Math.floor(y + h));

    for (let yy = y0; yy < y1; yy += 1) {
      for (let xx = x0; xx < x1; xx += 1) {
        if (blend && color.a < 255) {
          this.blendPixel(xx, yy, color);
        } else {
          this.setPixel(xx, yy, color);
        }
      }
    }
  }

  fillLinearGradient(bg1: Rgba, bg2: Rgba): void {
    const w = this.width;
    const h = this.height;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const t = (x / Math.max(1, w - 1) + y / Math.max(1, h - 1)) / 2;
        this.setPixel(x, y, lerpColor(bg1, bg2, t));
      }
    }
  }

  fillCircle(cx: number, cy: number, r: number, color: Rgba, blend = false): void {
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + r));

    for (let y = y0; y <= y1; y += 1) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x += 1) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2) {
          if (blend && color.a < 255) {
            this.blendPixel(x, y, color);
          } else {
            this.setPixel(x, y, color);
          }
        }
      }
    }
  }

  fillRoundRect(x: number, y: number, w: number, h: number, radius: number, color: Rgba, blend = false): void {
    const r = Math.max(0, Math.min(radius, Math.min(w / 2, h / 2)));
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const wi = Math.floor(w);
    const hi = Math.floor(h);

    // Center
    this.fillRect(xi + r, yi, wi - 2 * r, hi, color, blend);
    // Left/right
    this.fillRect(xi, yi + r, r, hi - 2 * r, color, blend);
    this.fillRect(xi + wi - r, yi + r, r, hi - 2 * r, color, blend);

    // Corners (quarter circles)
    const cornerColor = color;
    const drawCorner = (ccx: number, ccy: number, sx: number, sy: number) => {
      const r2 = r * r;
      const xStart = Math.max(0, Math.floor(ccx - r));
      const xEnd = Math.min(this.width - 1, Math.ceil(ccx + r));
      const yStart = Math.max(0, Math.floor(ccy - r));
      const yEnd = Math.min(this.height - 1, Math.ceil(ccy + r));

      for (let py = yStart; py <= yEnd; py += 1) {
        for (let px = xStart; px <= xEnd; px += 1) {
          const dx = px - ccx;
          const dy = py - ccy;
          if (dx * dx + dy * dy > r2) {
            continue;
          }

          const inQuadrant = sx === -1 ? px <= ccx : px >= ccx;
          const inQuadrantY = sy === -1 ? py <= ccy : py >= ccy;
          if (!inQuadrant || !inQuadrantY) {
            continue;
          }

          if (blend && cornerColor.a < 255) {
            this.blendPixel(px, py, cornerColor);
          } else {
            this.setPixel(px, py, cornerColor);
          }
        }
      }
    };

    drawCorner(xi + r, yi + r, -1, -1);
    drawCorner(xi + wi - r - 1, yi + r, 1, -1);
    drawCorner(xi + r, yi + hi - r - 1, -1, 1);
    drawCorner(xi + wi - r - 1, yi + hi - r - 1, 1, 1);
  }
}

const FONT_5X7: Record<string, number[]> = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  "?": [14, 17, 1, 2, 4, 0, 4],
  "!": [4, 4, 4, 4, 4, 0, 4],
  ".": [0, 0, 0, 0, 0, 4, 4],
  ",": [0, 0, 0, 0, 0, 4, 8],
  ":": [0, 4, 4, 0, 4, 4, 0],
  "-": [0, 0, 0, 31, 0, 0, 0],
  "_": [0, 0, 0, 0, 0, 0, 31],
  "/": [1, 2, 4, 8, 16, 0, 0],
  "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8],
  "+": [0, 4, 4, 31, 4, 4, 0],
  "0": [14, 17, 17, 17, 17, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [30, 1, 1, 14, 1, 1, 30],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 16, 30, 1, 1, 30],
  "6": [14, 16, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 1, 14],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [28, 18, 17, 17, 17, 18, 28],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 14],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 18, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 10, 4, 4, 4, 10, 17],
  Y: [17, 10, 4, 4, 4, 4, 4],
  Z: [31, 2, 4, 8, 16, 16, 31]
};

const measureTextWidth = (text: string, scale: number): number => {
  const chars = text.length;
  if (chars === 0) return 0;
  const advance = 6 * scale;
  return chars * advance - scale;
};

const drawText = (canvas: RasterCanvas, text: string, x: number, y: number, scale: number, color: Rgba): void => {
  const normalized = text.toUpperCase();
  let cursorX = x;
  for (const ch of normalized) {
    const glyph = FONT_5X7[ch] ?? FONT_5X7["?"];
    for (let row = 0; row < 7; row += 1) {
      const mask = glyph[row] ?? 0;
      for (let col = 0; col < 5; col += 1) {
        const bit = 1 << (4 - col);
        if ((mask & bit) === 0) continue;
        canvas.fillRect(cursorX + col * scale, y + row * scale, scale, scale, color, true);
      }
    }

    cursorX += 6 * scale;
  }
};

const wrapWords = (text: string, maxWidthPx: number, scale: number): string[] => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measureTextWidth(candidate, scale) <= maxWidthPx) {
      line = candidate;
      continue;
    }

    if (line) {
      lines.push(line);
      line = word;
      continue;
    }

    // Single long word: hard-truncate.
    let truncated = word;
    while (truncated.length > 1 && measureTextWidth(`${truncated}...`, scale) > maxWidthPx) {
      truncated = truncated.slice(0, -1);
    }
    lines.push(`${truncated}...`);
    line = "";
  }

  if (line) {
    lines.push(line);
  }

  return lines;
};

const encodePngRgba = (args: {
  width: number;
  height: number;
  rgba: Uint8Array;
}): Uint8Array => {
  const { width, height, rgba } = args;
  const bytesPerRow = width * 4;
  const raw = Buffer.alloc((bytesPerRow + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (bytesPerRow + 1);
    raw[rawOffset] = 0; // filter type 0
    raw.set(rgba.subarray(y * bytesPerRow, (y + 1) * bytesPerRow), rawOffset + 1);
  }

  const compressed = deflateSync(raw, { level: 9 });

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const byte of buf) {
      c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };

  const chunk = (type: string, data: Buffer): Buffer => {
    const typeBuf = Buffer.from(type, "ascii");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  };

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0))
  ]);
};

export const renderCoverPng = async (
  spec: CoverSpec,
  options: { width?: number; height?: number } = {}
): Promise<{ png: Uint8Array; width: number; height: number }> => {
  const width = Number.isFinite(options.width) ? Math.max(200, Number(options.width)) : 1200;
  const height = Number.isFinite(options.height) ? Math.max(200, Number(options.height)) : 600;
  const palette = PALETTES[spec.palette];

  const canvas = new RasterCanvas(width, height);
  canvas.fillLinearGradient(rgbaFromHex(palette.bg1), rgbaFromHex(palette.bg2));

  if (spec.template === "mosaic") {
    canvas.fillRect(width - 320, 60, 240, 240, rgbaFromHex(palette.accent, 30), true);
    canvas.fillRect(width - 260, 140, 240, 240, rgbaFromHex(palette.accent2, 30), true);
    canvas.fillRect(width - 380, 200, 240, 240, rgbaFromHex(palette.ink, 16), true);
  } else if (spec.template === "stamp") {
    const border = rgbaFromHex(palette.inkMuted, 110);
    canvas.fillRect(60, 60, width - 120, 6, border, true);
    canvas.fillRect(60, height - 66, width - 120, 6, border, true);
    canvas.fillRect(60, 60, 6, height - 120, border, true);
    canvas.fillRect(width - 66, 60, 6, height - 120, border, true);
    canvas.fillCircle(width - 190, 170, 88, rgbaFromHex(palette.accent, 46), true);
    canvas.fillCircle(width - 210, 190, 88, rgbaFromHex(palette.accent2, 32), true);
  } else {
    const grid = rgbaFromHex(palette.inkMuted, 30);
    canvas.fillRect(60, Math.floor(height / 2), width - 120, 2, grid, true);
    canvas.fillRect(Math.floor(width / 2), 60, 2, height - 120, grid, true);

    for (let idx = 0; idx < 18; idx += 1) {
      const x = 60 + Math.round(idx * ((width - 120) / 17));
      canvas.fillRect(x, 60, 1, height - 120, grid, true);
    }
    for (let idx = 0; idx < 10; idx += 1) {
      const y = 60 + Math.round(idx * ((height - 120) / 9));
      canvas.fillRect(60, y, width - 120, 1, grid, true);
    }
  }

  // Panel
  canvas.fillRoundRect(60, 80, width - 120, height - 180, 28, { r: 15, g: 23, b: 42, a: 92 }, true);

  const titleText = (spec.title ?? "").trim();
  const subtitleText = (spec.subtitle ?? "").trim();

  const maxTextWidth = width - 160;
  const titleScale = 8;
  const subtitleScale = 4;

  const titleLines = wrapWords(titleText, maxTextWidth, titleScale).slice(0, 2);
  const titleStartY = 110;
  const titleColor = rgbaFromHex(palette.ink, 255);

  for (let lineIndex = 0; lineIndex < titleLines.length; lineIndex += 1) {
    drawText(canvas, titleLines[lineIndex], 80, titleStartY + lineIndex * (7 * titleScale + 10), titleScale, titleColor);
  }

  if (subtitleText) {
    const subtitleLines = wrapWords(subtitleText, maxTextWidth, subtitleScale).slice(0, 1);
    if (subtitleLines[0]) {
      const y = titleStartY + titleLines.length * (7 * titleScale + 10) + 10;
      drawText(canvas, subtitleLines[0], 80, y, subtitleScale, rgbaFromHex(palette.inkMuted, 235));
    }
  }

  const badges = (spec.badges ?? []).slice(0, 6);
  const badgeY = height - 140;
  for (let index = 0; index < badges.length; index += 1) {
    const badge = badges[index];
    const badgeX = 80 + index * 190;
    const fill = rgbaFromHex(toneColor(palette, badge.tone), 242);
    canvas.fillRoundRect(badgeX, badgeY, 170, 44, 22, fill, true);

    const textColor =
      badge.tone === "neutral" ? rgbaFromHex(palette.bg1, 255) : rgbaFromHex("#0b1020", 255);
    const label = (badge.text ?? "").trim();
    const scale = 3;
    const textWidth = measureTextWidth(label.toUpperCase(), scale);
    const textX = badgeX + Math.max(10, Math.floor((170 - textWidth) / 2));
    const textY = badgeY + 12;
    drawText(canvas, label, textX, textY, scale, textColor);
  }

  const png = encodePngRgba({ width, height, rgba: canvas.data });
  return { png, width, height };
};
