import crypto from 'crypto';

/**
 * Generate a cryptographically secure numeric OTP string of specified length.
 * Uses crypto.randomInt to guarantee uniform distribution and cryptographic security.
 */
export function generateSecureOtp(length: number = 6): string {
  const min = 10 ** (length - 1);
  const max = 10 ** length;
  const num = crypto.randomInt(min, max);
  return num.toString();
}

/**
 * Hash an OTP using HMAC-SHA256 with the configured secret.
 */
export function hashOtp(otp: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(otp.trim()).digest('hex');
}

/**
 * Verify a plain OTP against an HMAC-SHA256 hash using timing-safe comparison.
 * Prevents timing attacks.
 */
export function verifyOtpHash(plainOtp: string, expectedHash: string, secret: string): boolean {
  if (!plainOtp || !expectedHash) return false;
  const candidateHash = hashOtp(plainOtp, secret);

  const candidateBuf = Buffer.from(candidateHash, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');

  if (candidateBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidateBuf, expectedBuf);
}

/**
 * Mask an email address to protect PII in logs and audits.
 * e.g., 'john.doe@example.com' -> 'jo***e@example.com'
 */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0) return '***@***.***';

  const userPart = trimmed.slice(0, atIndex);
  const domainPart = trimmed.slice(atIndex + 1);

  let maskedUser = '';
  if (userPart.length <= 2) {
    maskedUser = `${userPart.charAt(0)}***`;
  } else {
    maskedUser = `${userPart.slice(0, 2)}***${userPart.slice(-1)}`;
  }

  return `${maskedUser}@${domainPart}`;
}

/**
 * Mask an international phone number to protect PII in logs and audits.
 * e.g., '+919876543210' -> '+91*****3210'
 */
export function maskPhone(phone: string): string {
  const clean = phone.replace(/[^\d+]/g, '');
  if (clean.length <= 5) return '***';

  const prefix = clean.startsWith('+') ? clean.slice(0, 3) : clean.slice(0, 2);
  const suffix = clean.slice(-4);
  return `${prefix}*****${suffix}`;
}

/**
 * Validate and normalize a phone number into strict E.164 international format.
 * Format: +[country code][subscriber number], up to 15 digits total.
 */
export function normalizeE164(phone: string, defaultCountryCode?: string | null): string {
  let cleaned = phone.trim().replace(/[\s\-\(\)\.]/g, '');

  if (!cleaned.startsWith('+')) {
    if (defaultCountryCode) {
      const code = defaultCountryCode.trim().startsWith('+')
        ? defaultCountryCode.trim()
        : `+${defaultCountryCode.trim()}`;
      // If cleaned phone starts with 0 (e.g. UK 07123456789), strip leading 0
      if (cleaned.startsWith('0')) {
        cleaned = cleaned.slice(1);
      }
      cleaned = `${code}${cleaned}`;
    } else {
      cleaned = `+${cleaned}`;
    }
  }

  // Strict E.164 regex: + followed by 1 to 9, then 6 to 14 digits (7 to 15 digits total)
  const e164Regex = /^\+[1-9]\d{6,14}$/;
  if (!e164Regex.test(cleaned)) {
    throw new Error(
      `Invalid international phone number "${phone}". Phone number must be in E.164 format (e.g., +919876543210 or +15551234567).`
    );
  }

  return cleaned;
}

/**
 * Extract ISO-like or dial prefix from E.164 string for country grouping.
 */
export function extractCallingCode(e164: string): string {
  if (!e164.startsWith('+')) return 'UNKNOWN';
  if (e164.startsWith('+91')) return 'IN';
  if (e164.startsWith('+1')) return 'US/CA';
  if (e164.startsWith('+44')) return 'GB';
  if (e164.startsWith('+61')) return 'AU';
  if (e164.startsWith('+971')) return 'AE';
  if (e164.startsWith('+65')) return 'SG';
  return e164.slice(1, 4);
}
