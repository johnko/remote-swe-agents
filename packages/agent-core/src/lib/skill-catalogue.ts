import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { s3, SkillBucketName } from './aws/index.js';
import { Skill, CATALOGUE_MAX_BYTES, CATALOGUE_MAX_SKILLS, CATALOGUE_TRUNCATED_DESC_LENGTH } from '../schema/skill.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Local directory where skill files are downloaded from S3.
 * Configurable via SKILLS_LOCAL_DIR env var for test isolation (C3).
 */
export const getSkillsLocalDir = (): string => process.env.SKILLS_LOCAL_DIR || '/tmp/skills';

export const buildSkillCatalogue = (skills: Skill[]): string => {
  if (skills.length === 0) return '';

  const sorted = [...skills].sort((a, b) => b.updatedAt - a.updatedAt);
  const limited = sorted.slice(0, CATALOGUE_MAX_SKILLS);

  let catalogue = `## Available Skills

The following skills are available. When a user's request matches a skill, read the full skill content using the Read tool before proceeding.

| Skill | Description | Path |
|-------|-------------|------|
`;

  let currentSize = Buffer.byteLength(catalogue, 'utf8');

  for (const skill of limited) {
    let desc = skill.description;
    if (desc.length > CATALOGUE_TRUNCATED_DESC_LENGTH) {
      desc = desc.slice(0, CATALOGUE_TRUNCATED_DESC_LENGTH - 3) + '...';
    }
    const row = `| ${skill.name} | ${desc} | ${getSkillsLocalDir()}/${skill.SK}/SKILL.md |\n`;
    const rowSize = Buffer.byteLength(row, 'utf8');

    if (currentSize + rowSize > CATALOGUE_MAX_BYTES) break;
    catalogue += row;
    currentSize += rowSize;
  }

  if (skills.length > CATALOGUE_MAX_SKILLS) {
    catalogue += '\nAdditional skills available. Ask the user which skill to use.';
  }

  catalogue += `\nTo activate a skill, read its SKILL.md file. If the skill has \`allowed-tools\`, only those tools may be used for the remainder of that turn.`;

  return catalogue;
};

export const downloadSkillFiles = async (skills: Skill[]): Promise<void> => {
  const skillsLocalDir = getSkillsLocalDir();
  // Clean up old skill files
  if (fs.existsSync(skillsLocalDir)) {
    fs.rmSync(skillsLocalDir, { recursive: true, force: true });
  }
  fs.mkdirSync(skillsLocalDir, { recursive: true });

  for (const skill of skills) {
    const skillDir = path.join(skillsLocalDir, skill.SK);
    fs.mkdirSync(skillDir, { recursive: true });

    try {
      const prefix = skill.s3Prefix.endsWith('/') ? skill.s3Prefix : `${skill.s3Prefix}/`;
      const listRes = await s3.send(
        new ListObjectsV2Command({
          Bucket: SkillBucketName,
          Prefix: prefix,
        })
      );

      if (!listRes.Contents) continue;

      for (const obj of listRes.Contents) {
        if (!obj.Key) continue;
        const relativePath = obj.Key.slice(prefix.length);
        if (!relativePath) continue;

        const localPath = path.join(skillDir, relativePath);
        const localDir = path.dirname(localPath);

        // Security: ensure resolved path is within skillDir
        const resolved = path.resolve(localPath);
        if (!resolved.startsWith(path.resolve(skillDir))) {
          console.warn(`[skill-catalogue] Skipping path traversal attempt: ${relativePath}`);
          continue;
        }

        fs.mkdirSync(localDir, { recursive: true });

        const { Body } = await s3.send(new GetObjectCommand({ Bucket: SkillBucketName, Key: obj.Key }));
        if (Body) {
          const bytes = await Body.transformToByteArray();
          fs.writeFileSync(localPath, bytes);
        }
      }
    } catch (error) {
      console.warn(`[skill-catalogue] Failed to download files for skill ${skill.SK}:`, error);
    }
  }
};
