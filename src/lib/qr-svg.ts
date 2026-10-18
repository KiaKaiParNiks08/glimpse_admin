import QRCode from 'qrcode';

/** Draw a QR on this server. The payload is not sent to any QR website. */
export async function qrSvg(value: string): Promise<string> {
  return QRCode.toString(value, {
    type: 'svg',
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}
