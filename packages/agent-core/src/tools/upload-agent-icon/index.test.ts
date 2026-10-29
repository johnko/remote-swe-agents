import { describe, expect, test, vi, beforeEach } from 'vitest';
import { uploadAgentIconTool } from './index.js';
import type { ToolContext } from '../../private/common/types.js';

const mockS3Send = vi.fn();
const mockRandomBytes = vi.fn();

vi.mock('../../lib/aws/s3.js', () => ({
  s3: { send: (...args: any[]) => mockS3Send(...args) },
  BucketName: 'test-bucket',
}));

vi.mock('crypto', () => ({
  randomBytes: (size: number) => mockRandomBytes(size),
}));

const context: ToolContext = {
  workerId: 'worker-1',
  toolUseId: 'tool-use-1',
  globalPreferences: {} as any,
};

// Helper to create a base64-encoded buffer of specified size
const createBase64Image = (sizeBytes: number, contentType: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png'): string => {
  const buffer = Buffer.alloc(sizeBytes, 'a');
  return buffer.toString('base64');
};

describe('uploadAgentIconTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock randomBytes to return a buffer that converts to the expected hex string
    mockRandomBytes.mockReturnValue(Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]));
  });

  test('uploads PNG image successfully', async () => {
    const base64Data = createBase64Image(1024, 'image/png');
    
    mockS3Send.mockResolvedValueOnce({});

    const result = await uploadAgentIconTool.handler(
      { base64Data, contentType: 'image/png' },
      context
    );

    expect(result).toMatch(/Icon uploaded successfully/);
    expect(result).toContain('worker-1/');
    expect(result).toContain('.png');
    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });

  test('uploads JPEG image successfully', async () => {
    const base64Data = createBase64Image(2048, 'image/jpeg');
    
    mockS3Send.mockResolvedValueOnce({});

    const result = await uploadAgentIconTool.handler(
      { base64Data, contentType: 'image/jpeg' },
      context
    );

    expect(result).toMatch(/Icon uploaded successfully/);
    expect(result).toContain('worker-1/');
    expect(result).toContain('.jpeg');
  });

  test('uploads WebP image successfully', async () => {
    const base64Data = createBase64Image(1500, 'image/webp');
    
    mockS3Send.mockResolvedValueOnce({});

    const result = await uploadAgentIconTool.handler(
      { base64Data, contentType: 'image/webp' },
      context
    );

    expect(result).toMatch(/Icon uploaded successfully/);
    expect(result).toContain('worker-1/');
    expect(result).toContain('.webp');
  });

  test('rejects empty image data', async () => {
    const emptyBase64 = Buffer.alloc(0).toString('base64');
    
    const result = await uploadAgentIconTool.handler(
      { base64Data: emptyBase64, contentType: 'image/png' },
      context
    );

    expect(result).toBe('Error: Image data is empty.');
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  test('rejects image exceeding 5MB limit', async () => {
    const fiveMBPlus = 5 * 1024 * 1024 + 1;
    const base64Data = createBase64Image(fiveMBPlus, 'image/png');
    
    const result = await uploadAgentIconTool.handler(
      { base64Data, contentType: 'image/png' },
      context
    );

    expect(result).toMatch(/Error: Image file is too large/);
    expect(result).toMatch(/5\.00MB/);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  test('accepts image exactly at 5MB limit', async () => {
    const exactlyFiveMB = 5 * 1024 * 1024;
    const base64Data = createBase64Image(exactlyFiveMB, 'image/png');
    
    mockS3Send.mockResolvedValueOnce({});

    const result = await uploadAgentIconTool.handler(
      { base64Data, contentType: 'image/png' },
      context
    );

    expect(result).toMatch(/Icon uploaded successfully/);
    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });

  test('handles S3 upload errors gracefully', async () => {
    const base64Data = createBase64Image(1024, 'image/png');
    
    mockS3Send.mockRejectedValueOnce(new Error('S3 service temporarily unavailable'));

    const result = await uploadAgentIconTool.handler(
      { base64Data, contentType: 'image/png' },
      context
    );

    expect(result).toContain('Error uploading icon');
    expect(result).toContain('S3 service temporarily unavailable');
  });

  test('handles non-Error thrown exceptions', async () => {
    const base64Data = createBase64Image(1024, 'image/png');
    
    mockS3Send.mockRejectedValueOnce('Unknown exception type');

    const result = await uploadAgentIconTool.handler(
      { base64Data, contentType: 'image/png' },
      context
    );

    expect(result).toContain('Error uploading icon');
    expect(result).toContain('Unknown error');
  });

  test('generates unique S3 keys for multiple uploads', async () => {
    const base64Data = createBase64Image(1024, 'image/png');
    
    mockS3Send.mockResolvedValue({});
    mockRandomBytes
      .mockReturnValueOnce(Buffer.from([0xaa, 0xaa, 0xbb, 0xbb, 0xcc, 0xcc, 0xdd, 0xdd]))
      .mockReturnValueOnce(Buffer.from([0xee, 0xee, 0xff, 0xff, 0x11, 0x11, 0x22, 0x22]));

    const result1 = await uploadAgentIconTool.handler(
      { base64Data, contentType: 'image/png' },
      context
    );

    const result2 = await uploadAgentIconTool.handler(
      { base64Data, contentType: 'image/png' },
      context
    );

    // Extract the hex IDs from the results
    const match1 = result1.match(/worker-1\/([a-f0-9]+)\.png/);
    const match2 = result2.match(/worker-1\/([a-f0-9]+)\.png/);
    
    expect(match1).toBeTruthy();
    expect(match2).toBeTruthy();
    expect(match1![1]).not.toBe(match2![1]);
  });

  test('uses workerId in S3 key path', async () => {
    const base64Data = createBase64Image(1024, 'image/png');
    const customContext: ToolContext = {
      workerId: 'custom-worker-xyz',
      toolUseId: 'tool-use-1',
      globalPreferences: {} as any,
    };
    
    mockS3Send.mockResolvedValueOnce({});

    const result = await uploadAgentIconTool.handler(
      { base64Data, contentType: 'image/png' },
      customContext
    );

    expect(result).toContain('custom-worker-xyz/');
  });

  test('passes correct content type to S3', async () => {
    const base64Data = createBase64Image(1024, 'image/jpeg');
    
    mockS3Send.mockResolvedValueOnce({});

    await uploadAgentIconTool.handler(
      { base64Data, contentType: 'image/jpeg' },
      context
    );

    const s3Call = mockS3Send.mock.calls[0][0];
    expect(s3Call.constructor.name).toBe('PutObjectCommand');
    expect(s3Call.input.ContentType).toBe('image/jpeg');
  });

  test('encodes image buffer correctly in S3 upload', async () => {
    const testData = 'test-image-data';
    const base64Data = Buffer.from(testData).toString('base64');
    
    mockS3Send.mockResolvedValueOnce({});

    await uploadAgentIconTool.handler(
      { base64Data, contentType: 'image/png' },
      context
    );

    const s3Call = mockS3Send.mock.calls[0][0];
    const uploadedBuffer = s3Call.input.Body;
    expect(uploadedBuffer.toString()).toBe(testData);
  });
});
