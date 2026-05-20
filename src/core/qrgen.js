// proxvert · QRCode 生成瘦封装
import QRCode from 'qrcode';

const DEFAULT = {
  errorCorrectionLevel: 'M',
  margin: 1,
  scale: 4,
  color: { dark: '#0f172a', light: '#ffffff' }
};

function themedColor() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return isLight
    ? { dark: '#0f172a', light: '#ffffff' }
    : { dark: '#e2e8f0', light: '#0a0b14' };
}

export function toDataURL(text, opts = {}) {
  return QRCode.toDataURL(text, { ...DEFAULT, color: themedColor(), ...opts });
}

export function toCanvas(canvas, text, opts = {}) {
  return QRCode.toCanvas(canvas, text, { ...DEFAULT, color: themedColor(), ...opts });
}

// 经验:QR Code v40-M 容量约 2331 字符,留出余量
export const QR_SAFE_LEN = 2000;
