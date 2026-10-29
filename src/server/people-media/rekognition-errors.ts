export type RekognitionFailureKind =
  | 'access_denied'
  | 'invalid_credentials'
  | 'invalid_image'
  | 'unsupported_format'
  | 'throttled'
  | 'missing_config'
  | 'transient'
  | 'unknown';

export type SanitizedRekognitionError = {
  kind: RekognitionFailureKind;
  permanent: boolean;
  name: string;
  http_status: number | null;
  request_id: string | null;
  region: string | null;
  message: string;
};

export class RekognitionJobError extends Error {
  readonly code: string;
  readonly permanent: boolean;
  readonly kind: RekognitionFailureKind;

  constructor(code: string, kind: RekognitionFailureKind, permanent: boolean, message?: string) {
    super(message ?? code);
    this.name = 'RekognitionJobError';
    this.code = code;
    this.kind = kind;
    this.permanent = permanent;
  }
}

const SECRETISH = new RegExp('AKIA[A-Z0-9]{16}|secret|credential|authorization|signature=|x-amz-|https?://\\S+', 'gi');

export function sanitizeRekognitionMessage(raw: string): string {
  return raw.replace(SECRETISH, '[redacted]').replace(/\s+/g, ' ').trim().slice(0, 180);
}

type AwsLike = {
  name?: string;
  message?: string;
  code?: string;
  Code?: string;
  $metadata?: { httpStatusCode?: number; requestId?: string; extendedRequestId?: string };
};

function awsFields(error: unknown): AwsLike {
  if (!error || typeof error !== 'object') return { message: String(error) };
  return error as AwsLike;
}

export function classifyRekognitionError(error: unknown, region?: string | null): SanitizedRekognitionError {
  const fields = awsFields(error);
  const name = fields.name || fields.Code || fields.code || 'Error';
  const http = fields.$metadata?.httpStatusCode ?? null;
  const requestId = fields.$metadata?.requestId ?? fields.$metadata?.extendedRequestId ?? null;
  const message = sanitizeRekognitionMessage(fields.message || '');

  let kind: RekognitionFailureKind = 'unknown';
  let permanent = false;

  if (
    name === 'AccessDeniedException' ||
    name === 'UnrecognizedClientException' ||
    /not authorized|AccessDenied|explicit deny/i.test(message)
  ) {
    kind = 'access_denied';
    permanent = true;
  } else if (name === 'InvalidSignatureException' || name === 'IncompleteSignatureException' || /security token/i.test(message)) {
    kind = 'invalid_credentials';
    permanent = true;
  } else if (name === 'InvalidImageFormatException' || name === 'InvalidImageTypeException') {
    kind = 'unsupported_format';
    permanent = true;
  } else if (name === 'ImageTooLargeException') {
    kind = 'invalid_image';
    permanent = true;
  } else if (
    name === 'ProvisionedThroughputExceededException' ||
    name === 'ThrottlingException' ||
    /Rate exceeded|Too many requests/i.test(message)
  ) {
    kind = 'throttled';
    permanent = false;
  } else if (http === 500 || http === 503 || name === 'ServiceUnavailableException' || name === 'TimeoutError') {
    kind = 'transient';
    permanent = false;
  } else if (!process.env.AWS_REGION?.trim() || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    kind = 'missing_config';
    permanent = true;
  }

  return {
    kind,
    permanent,
    name,
    http_status: http,
    request_id: requestId,
    region: region ?? process.env.AWS_REGION?.trim() ?? null,
    message,
  };
}

export function rekognitionFailureCode(kind: RekognitionFailureKind): string {
  return `rekognition_${kind}`;
}
