import { z } from 'zod';
import { ToolDefinition, zodToJsonSchemaBody } from '../../private/common/lib';
import { s3, BucketName } from '../../lib/aws/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';

const inputSchema = z.object({
  base64Data: z.string().describe('Base64-encoded image data'),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']).describe('Image content type'),
});

type InputType = z.infer<typeof inputSchema>;

export const uploadAgentIconTool: ToolDefinition<InputType> = {
  name: 'upload_agent_icon',
  handler: async (input, context) => {
    const { base64Data, contentType } = input;
    const { workerId } = context;

    if (!BucketName) {
      return 'Error: S3 bucket is not configured.';
    }

    try {
      // Decode base64 to buffer
      const buffer = Buffer.from(base64Data, 'base64');

      if (buffer.length === 0) {
        return 'Error: Image data is empty.';
      }

      // Limit file size to 5MB
      const maxSize = 5 * 1024 * 1024;
      if (buffer.length > maxSize) {
        return `Error: Image file is too large. Maximum size is 5MB, got ${(buffer.length / 1024 / 1024).toFixed(2)}MB.`;
      }

      // Generate S3 key
      const extension = contentType.split('/')[1];
      const randomId = randomBytes(8).toString('hex');
      const key = `${workerId}/${randomId}.${extension}`;

      // Upload to S3
      await s3.send(
        new PutObjectCommand({
          Bucket: BucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        })
      );

      return `Icon uploaded successfully. Icon key: ${key}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return `Error uploading icon: ${errorMessage}`;
    }
  },
  schema: inputSchema,
  toolSpec: async () => ({
    name: 'upload_agent_icon',
    description:
      'Upload a base64-encoded image to use as an agent icon. Returns the S3 key, which can be passed to update_agent to set the agent icon. Supported formats: PNG, JPEG, WebP. Maximum file size: 5MB.',
    inputSchema: { json: zodToJsonSchemaBody(inputSchema) },
  }),
};
