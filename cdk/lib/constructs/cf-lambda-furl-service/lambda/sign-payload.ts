import type { CloudFrontRequestEvent, CloudFrontRequestHandler, CloudFrontRequest } from 'aws-lambda';
import { createHash } from 'crypto';

const hashPayload = (payload: Buffer) => {
  return createHash('sha256').update(payload).digest('hex');
};

// Security: Add security headers to help prevent common attacks
// These will be forwarded to the origin and can be returned in responses
function addSecurityHeaders(request: CloudFrontRequest): void {
  // Add security-related headers that should be forwarded
  const securityHeaders = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-XSS-Protection', value: '1; mode=block' },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ];

  for (const header of securityHeaders) {
    request.headers[header.key.toLowerCase()] = [{ key: header.key, value: header.value }];
  }
}

// Validate request before processing
function validateRequest(request: CloudFrontRequest): { valid: boolean; reason?: string } {
  // Check for suspicious patterns in the URI
  const uri = request.uri;
  
  // Block path traversal attempts
  if (uri.includes('..') || uri.includes('\0')) {
    return { valid: false, reason: 'Invalid path' };
  }
  
  // Block overly long URIs (potential DoS)
  if (uri.length > 4096) {
    return { valid: false, reason: 'URI too long' };
  }
  
  // Validate query string length
  if (request.querystring && request.querystring.length > 4096) {
    return { valid: false, reason: 'Query string too long' };
  }
  
  // Block requests with suspicious headers (basic header injection check)
  const suspiciousHeaders = ['x-http-method-override', 'x-http-method', 'x-method-override'];
  for (const headerName of suspiciousHeaders) {
    if (request.headers[headerName.toLowerCase()]) {
      // Log and remove suspicious headers - they could be used for method override attacks
      console.warn(`[EdgeFunction] Removing suspicious header: ${headerName}`);
      delete request.headers[headerName.toLowerCase()];
    }
  }
  
  return { valid: true };
}

export const handler: CloudFrontRequestHandler = async (event: CloudFrontRequestEvent) => {
  const request = event.Records[0].cf.request;
  
  // Validate request
  const validation = validateRequest(request);
  if (!validation.valid) {
    console.error(`[EdgeFunction] Request rejected: ${validation.reason}`);
    return {
      status: '400',
      statusDescription: 'Bad Request',
      body: 'Invalid request',
      headers: {},
    };
  }
  
  // Add security headers
  addSecurityHeaders(request);
  
  const body = request.body?.data ?? '';

  const hashedBody = hashPayload(Buffer.from(body, 'base64'));
  request.headers['x-amz-content-sha256'] = [{ key: 'x-amz-content-sha256', value: hashedBody }];

  // LWA replaces authorization2 to authorization again
  // if (request.headers['authorization'] != null) {
  //   request.headers['authorization2'] = [{ key: 'authorization2', value: request.headers['authorization'][0].value }];
  //   delete request.headers['authorization'];
  // }

  return request;
};
