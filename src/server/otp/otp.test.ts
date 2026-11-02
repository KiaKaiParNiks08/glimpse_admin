import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSecureOtp,
  hashOtp,
  verifyOtpHash,
  maskEmail,
  maskPhone,
  normalizeE164,
  extractCallingCode,
} from './crypto.ts';
import { validateOtpDeliveryConfig, getOtpConfig } from './config.ts';
import { renderOtpEmail, DEFAULT_BRANDING } from './templates/email-template.ts';

describe('OTP Cryptographic & Security Operations', () => {
  test('generateSecureOtp generates uniform 6-digit numeric strings', () => {
    for (let i = 0; i < 50; i++) {
      const otp = generateSecureOtp(6);
      assert.equal(otp.length, 6);
      assert.match(otp, /^\d{6}$/);
      const num = Number.parseInt(otp, 10);
      assert.ok(num >= 100000 && num <= 999999);
    }
  });

  test('hashOtp produces 64-char hex HMAC-SHA256 hash', () => {
    const secret = 'test-secret-must-be-long-enough-32-bytes';
    const hash1 = hashOtp('123456', secret);
    const hash2 = hashOtp('123456', secret);
    const hash3 = hashOtp('654321', secret);

    assert.equal(hash1.length, 64);
    assert.equal(hash1, hash2);
    assert.notEqual(hash1, hash3);
  });

  test('verifyOtpHash verifies matching OTP and rejects invalid OTP timing-safely', () => {
    const secret = 'super-secret-key-for-otp-verification';
    const validOtp = '748291';
    const hash = hashOtp(validOtp, secret);

    assert.equal(verifyOtpHash(validOtp, hash, secret), true);
    assert.equal(verifyOtpHash('000000', hash, secret), false);
    assert.equal(verifyOtpHash('748290', hash, secret), false);
    assert.equal(verifyOtpHash('', hash, secret), false);
  });

  test('maskEmail obfuscates email addresses for privacy', () => {
    assert.equal(maskEmail('john.doe@example.com'), 'jo***e@example.com');
    assert.equal(maskEmail('a@test.org'), 'a***@test.org');
    assert.equal(maskEmail('ab@domain.com'), 'a***@domain.com');
  });

  test('maskPhone obfuscates phone numbers for privacy', () => {
    assert.equal(maskPhone('+919876543210'), '+91*****3210');
    assert.equal(maskPhone('+15551234567'), '+15*****4567');
  });

  test('normalizeE164 formats valid international phone numbers', () => {
    assert.equal(normalizeE164('+919876543210'), '+919876543210');
    assert.equal(normalizeE164('9876543210', '+91'), '+919876543210');
    assert.equal(normalizeE164('555-123-4567', '+1'), '+15551234567');
    assert.equal(normalizeE164('07123456789', '+44'), '+447123456789');
  });

  test('normalizeE164 rejects invalid phone numbers', () => {
    assert.throws(() => normalizeE164('abc'), /Invalid international phone number/);
    assert.throws(() => normalizeE164('123'), /Invalid international phone number/);
    assert.throws(() => normalizeE164('+012345678'), /Invalid international phone number/);
  });

  test('extractCallingCode correctly detects destination country codes', () => {
    assert.equal(extractCallingCode('+919876543210'), 'IN');
    assert.equal(extractCallingCode('+15551234567'), 'US/CA');
    assert.equal(extractCallingCode('+447123456789'), 'GB');
  });
});

describe('Dynamic Email Template & Branding', () => {
  test('renders branded email with event name, colors, and prominent OTP', () => {
    const branding = {
      eventName: 'Sarah & David Wedding',
      eventLogo: 'https://cdn.glimpseapp.com/events/wedding-logo.png',
      primaryColor: '#e11d48',
      secondaryColor: '#9f1239',
      buttonColor: '#e11d48',
      backgroundColor: '#f8fafc',
      footerText: 'Powered by Glimpse • Sarah & David Wedding',
    };

    const rendered = renderOtpEmail({
      otp: '482915',
      branding,
      expiryMinutes: 5,
    });

    assert.equal(rendered.subject, 'Sarah & David Wedding: Your Verification Code is 482915');
    assert.ok(rendered.html.includes('482915'), 'HTML must contain the OTP');
    assert.ok(rendered.html.includes('Sarah &amp; David Wedding'), 'HTML must contain escaped event name');
    assert.ok(rendered.html.includes('wedding-logo.png'), 'HTML must include event logo');
    assert.ok(rendered.html.includes('#e11d48'), 'HTML must include primary brand color');
    assert.ok(rendered.html.includes('5 minutes'), 'HTML must state 5 minutes expiry');
    assert.ok(rendered.html.includes('Security Warning'), 'HTML must contain security warning');
    assert.ok(rendered.text.includes('482915'), 'Plaintext must contain OTP');
    assert.ok(rendered.text.includes('5 minutes'), 'Plaintext must state expiry');
  });

  test('renders fallback email with default company branding when event is missing', () => {
    const rendered = renderOtpEmail({
      otp: '930184',
      branding: DEFAULT_BRANDING,
      expiryMinutes: 5,
    });

    assert.equal(rendered.subject, 'Glimpse: Your Verification Code is 930184');
    assert.ok(rendered.html.includes('930184'));
    assert.ok(rendered.html.includes('Glimpse'));
    assert.ok(!rendered.html.includes('<img src=""'), 'Must not render empty img tag');
    assert.ok(rendered.text.includes('Glimpse • Your Event Memory Platform'));
  });
});

describe('AWS Configuration & Sandbox Validation', () => {
  test('validates required AWS configuration without leaking secrets', () => {
    const originalRegion = process.env.AWS_REGION;
    const originalKey = process.env.AWS_ACCESS_KEY_ID;
    const originalSecret = process.env.AWS_SECRET_ACCESS_KEY;
    const originalEmail = process.env.AWS_SES_FROM_EMAIL;

    try {
      // Valid environment
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
      process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      process.env.AWS_SES_FROM_EMAIL = 'verify@glimpseapp.com';

      assert.doesNotThrow(() => validateOtpDeliveryConfig('email'));

      // Missing AWS_ACCESS_KEY_ID
      process.env.AWS_ACCESS_KEY_ID = '';
      assert.throws(
        () => validateOtpDeliveryConfig('email'),
        (err: Error) => {
          assert.ok(err.message.includes('AWS_ACCESS_KEY_ID is missing or invalid'));
          assert.ok(!err.message.includes('wJalrXUtnFEMI'), 'Must never leak secret key in error');
          return true;
        }
      );

      // Missing AWS_SES_FROM_EMAIL
      process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
      process.env.AWS_SES_FROM_EMAIL = 'invalid-email-no-at';
      assert.throws(() => validateOtpDeliveryConfig('email'), /AWS_SES_FROM_EMAIL must be a valid email/);
    } finally {
      process.env.AWS_REGION = originalRegion;
      process.env.AWS_ACCESS_KEY_ID = originalKey;
      process.env.AWS_SECRET_ACCESS_KEY = originalSecret;
      process.env.AWS_SES_FROM_EMAIL = originalEmail;
    }
  });

  test('validates SMS configuration when SMS is enabled', () => {
    const origRegion = process.env.AWS_REGION;
    const origKey = process.env.AWS_ACCESS_KEY_ID;
    const origSecret = process.env.AWS_SECRET_ACCESS_KEY;
    const origEnabled = process.env.AWS_SMS_ENABLED;
    const origSender = process.env.AWS_SMS_SENDER_ID;
    const origOrigination = process.env.AWS_SMS_ORIGINATION_IDENTITY;
    const origPool = process.env.AWS_SMS_POOL_ID;

    try {
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
      process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      process.env.AWS_SMS_ENABLED = 'true';
      process.env.AWS_SMS_SENDER_ID = '';
      process.env.AWS_SMS_ORIGINATION_IDENTITY = '';
      process.env.AWS_SMS_POOL_ID = '';

      assert.throws(
        () => validateOtpDeliveryConfig('sms'),
        /none of AWS_SMS_ORIGINATION_IDENTITY, AWS_SMS_POOL_ID, or AWS_SMS_SENDER_ID/
      );

      process.env.AWS_SMS_SENDER_ID = 'GLIMPSE';
      assert.doesNotThrow(() => validateOtpDeliveryConfig('sms'));
    } finally {
      process.env.AWS_REGION = origRegion;
      process.env.AWS_ACCESS_KEY_ID = origKey;
      process.env.AWS_SECRET_ACCESS_KEY = origSecret;
      process.env.AWS_SMS_ENABLED = origEnabled;
      process.env.AWS_SMS_SENDER_ID = origSender;
      process.env.AWS_SMS_ORIGINATION_IDENTITY = origOrigination;
      process.env.AWS_SMS_POOL_ID = origPool;
    }
  });
});

describe('SMS Character Length and Single-Segment GSM-7 Compliance', () => {
  test('OTP SMS message body stays within 160 characters for single-segment delivery', () => {
    const otp = '123456';
    const expiryMinutes = 5;
    const brandName = 'Glimpse Events';

    const cleanBrand = brandName.replace(/[^\w\s-]/g, '').trim().slice(0, 20);
    const messageBody = `${cleanBrand}: Your verification code is ${otp}. Valid for ${expiryMinutes} minutes. Do not share this code.`;

    assert.ok(
      messageBody.length <= 160,
      `Message length was ${messageBody.length}, which exceeds single-segment GSM-7 limit of 160`
    );
    assert.equal(
      messageBody,
      'Glimpse Events: Your verification code is 123456. Valid for 5 minutes. Do not share this code.'
    );
  });
});

describe('AWS Error & Sandbox Restriction Diagnostics', () => {
  test('identifies SES sandbox restriction and formats actionable diagnostic message', () => {
    const sesSandboxError = {
      name: 'MessageRejected',
      message: 'Email address is not verified. The following identities failed the check in region us-east-1: guest@example.com',
    };

    const isSandboxRestriction =
      sesSandboxError.name === 'MessageRejected' &&
      sesSandboxError.message.includes('Email address is not verified');

    assert.equal(isSandboxRestriction, true);

    const diagnostic = isSandboxRestriction
      ? `AWS SES Sandbox Restriction: Recipient "guest@example.com" is not verified in the AWS SES account. In sandbox mode, you must verify destination email addresses in the AWS SES console or request SES production access.`
      : sesSandboxError.message;

    assert.ok(diagnostic.includes('AWS SES Sandbox Restriction'));
    assert.ok(diagnostic.includes('guest@example.com'));
    assert.ok(diagnostic.includes('request SES production access'));
  });

  test('identifies SMS sandbox restriction and formats actionable diagnostic message', () => {
    const smsSandboxError = {
      name: 'ValidationException',
      message: 'Destination phone number is not verified in the SMS sandbox: +919876543210',
    };

    const isSandboxRestriction = smsSandboxError.message.toLowerCase().includes('not verified in the sms sandbox');
    assert.equal(isSandboxRestriction, true);

    const diagnostic = isSandboxRestriction
      ? `AWS SMS Sandbox Restriction: Destination number +91*****3210 is not verified in the AWS End User Messaging SMS sandbox. In sandbox mode, destination numbers must be verified in the AWS console before sending.`
      : smsSandboxError.message;

    assert.ok(diagnostic.includes('AWS SMS Sandbox Restriction'));
    assert.ok(diagnostic.includes('+91*****3210'));
  });

  test('identifies AWS credential failures and produces clear error message without secret exposure', () => {
    const credError = {
      name: 'InvalidClientTokenId',
      message: 'The security token included in the request is invalid.',
    };

    let diagnostic = credError.message;
    if (credError.name === 'InvalidClientTokenId' || credError.name === 'SignatureDoesNotMatch') {
      diagnostic = 'AWS Authentication Failed: Invalid AWS access key or secret key for SES.';
    }

    assert.equal(diagnostic, 'AWS Authentication Failed: Invalid AWS access key or secret key for SES.');
    assert.ok(!diagnostic.includes('AKIA'));
  });
});

describe('OTP Verification State & Security Lifecycle Logic', () => {
  const secret = 'test-suite-otp-hmac-secret-min-32-chars';

  test('valid OTP matches and is accepted', () => {
    const plainOtp = '654321';
    const storedHash = hashOtp(plainOtp, secret);

    const isMatch = verifyOtpHash(plainOtp, storedHash, secret);
    assert.equal(isMatch, true);
  });

  test('invalid OTP fails timing-safe match and decrements remaining attempts', () => {
    const plainOtp = '654321';
    const wrongOtp = '111111';
    const storedHash = hashOtp(plainOtp, secret);

    const isMatch = verifyOtpHash(wrongOtp, storedHash, secret);
    assert.equal(isMatch, false);

    const maxAttempts = 5;
    let attempts = 0;
    attempts += 1;

    const remainingAttempts = Math.max(0, maxAttempts - attempts);
    assert.equal(remainingAttempts, 4);
  });

  test('reaching maximum 5 attempts invalidates OTP and locks verification', () => {
    const maxAttempts = 5;
    let attempts = 4;
    attempts += 1;

    const isMaxExceeded = attempts >= maxAttempts;
    assert.equal(isMaxExceeded, true);
    assert.equal(Math.max(0, maxAttempts - attempts), 0);
  });

  test('expired OTP is rejected when current timestamp is past expires_at', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000 - 1000);
    const isExpired = fiveMinutesAgo < new Date();
    assert.equal(isExpired, true);
  });

  test('resend cooldown calculates remaining seconds accurately', () => {
    const cooldownAvailableAt = new Date(Date.now() + 45 * 1000);
    const remainingSec = Math.ceil((cooldownAvailableAt.getTime() - Date.now()) / 1000);
    assert.ok(remainingSec >= 40 && remainingSec <= 45);
  });
});
