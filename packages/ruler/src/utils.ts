import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import * as toml from 'toml';

export function log(message: string, verbose: boolean = false): void {
  if (verbose) {
    console.error(`[RULER] ${message}`);
  }
}

export function info(message: string): void {
  console.log(message);
}

export function error(message: string): void {
  console.error(`ERROR: ${message}`);
}

export function warning(message: string): void {
  console.warn(`WARNING: ${message}`);
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

export async function backupFile(filePath: string): Promise<void> {
  if (await fileExists(filePath)) {
    const backupPath = `${filePath}.bak`;
    await copyFile(filePath, backupPath);
  }
}

export async function findMarkdownFiles(rulerDir: string): Promise<string[]> {
  const pattern = path.join(rulerDir, '**/*.md').replace(/\\/g, '/');
  const files = await glob(pattern);
  return files.sort();
}

export async function concatenateMarkdownFiles(files: string[], rulerDir: string): Promise<string> {
  const contents: string[] = [];
  
  for (const file of files) {
    const relativePath = path.relative(rulerDir, file);
    const content = await readFile(file);
    contents.push(`--- Source: ${relativePath} ---\n\n${content}`);
  }
  
  return contents.join('\n\n');
}

export function parseToml(content: string): any {
  try {
    return toml.parse(content);
  } catch (error) {
    throw new Error(`Invalid TOML format: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function normalizeAgentName(name: string): string {
  return name.toLowerCase().trim();
}

export function matchesAgent(agentName: string, pattern: string): boolean {
  return normalizeAgentName(agentName).includes(normalizeAgentName(pattern));
}

export function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function isValidPath(filePath: string): boolean {
  try {
    path.parse(filePath);
    return true;
  } catch {
    return false;
  }
}