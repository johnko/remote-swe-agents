import { z } from 'zod';
import { ToolDefinition, zodToJsonSchemaBody } from '../../private/common/lib.js';
import { promises as fs } from 'fs';
import { resolve, isAbsolute, posix } from 'path';
import { homedir, tmpdir } from 'os';
import sharp from 'sharp';

const inputSchema = z.object({
  imagePath: z.string().describe('The local file system path (absolute) to the image.'),
});

const name = 'read_local_image';

// Allowed base directories for file operations
const ALLOWED_BASE_DIRS = [
  resolve(homedir()),
  resolve(tmpdir()),
  '/tmp',
  '/var/tmp',
];

/**
 * Validates that filePath is within allowed directories and not attempting path traversal.
 * This prevents directory traversal attacks (e.g., ../../../etc/passwd).
 * @param filePath The file path to validate
 * @param operationDescription Description of the operation for error messages
 * @returns The normalized absolute path
 * @throws Error if path is outside allowed directories
 */
const validateFilePath = (filePath: string, operationDescription: string = 'file access'): string => {
  // Check if path is absolute
  if (!isAbsolute(filePath)) {
    throw new Error(
      `Path "${filePath}" is not absolute. ` +
      `Only absolute paths are allowed for ${operationDescription}. ` +
      `Use an absolute path starting with "/"`
    );
  }

  // Resolve and normalize the path (removes .. and . segments)
  const resolvedPath = resolve(filePath);

  // Verify the path is within one of the allowed base directories
  const isAllowed = ALLOWED_BASE_DIRS.some((allowedDir) => {
    // Ensure the path starts with the allowed directory followed by a separator
    // or is exactly the allowed directory
    const normalizedAllowed = posix.normalize(allowedDir);
    const normalizedPath = posix.normalize(resolvedPath);
    return normalizedPath === normalizedAllowed || normalizedPath.startsWith(normalizedAllowed + '/');
  });

  if (!isAllowed) {
    throw new Error(
      `Path "${filePath}" is outside allowed directories for ${operationDescription}. ` +
      `Access denied for security reasons.`
    );
  }

  return resolvedPath;
};

export const readImageTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name,
  handler: async (input: z.infer<typeof inputSchema>) => {
    // SECURITY: Validate path to prevent directory traversal attacks
    const validatedPath = validateFilePath(input.imagePath, 'image reading');

    // Check if file exists
    await fs.access(validatedPath);

    // Convert image to webp format using sharp
    const webpBuffer = await sharp(validatedPath).webp().toBuffer();

    // Return JSON stringified result with image data
    return [
      {
        image: {
          format: 'webp',
          source: { bytes: webpBuffer },
        },
      },
    ];
  },
  schema: inputSchema,
  toolSpec: async () => ({
    name,
    description: `Read an image in the local file system. Use this tool to get the visual details of an image. You cannot pass an Internet URL here; you must download the image locally first.`,
    inputSchema: {
      json: zodToJsonSchemaBody(inputSchema),
    },
  }),
};
