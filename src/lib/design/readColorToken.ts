export type RGB = [number, number, number];

export function parseColorToken(value: string): RGB {
  const text = value.trim();
  const short = text.match(/^#([\da-f])([\da-f])([\da-f])$/i);
  if (short) return short.slice(1).map(channel => parseInt(channel + channel, 16) / 255) as RGB;
  const hex = text.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (hex) return hex.slice(1).map(channel => parseInt(channel, 16) / 255) as RGB;
  const rgb = text.match(/^rgb\(\s*(\d*\.?\d+)%\s+(\d*\.?\d+)%\s+(\d*\.?\d+)%\s*\)$/);
  if (rgb) {
    const channels = rgb.slice(1).map(channel => Number(channel) / 100);
    if (channels.every(channel => channel >= 0 && channel <= 1)) return channels as RGB;
  }
  throw new Error(`지원하지 않는 색상 토큰: ${text}`);
}

export function readColorToken(name: string): RGB {
  return parseColorToken(getComputedStyle(document.documentElement).getPropertyValue(name));
}
