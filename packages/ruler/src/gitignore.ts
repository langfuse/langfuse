import path from 'path';
import { AgentDefinition } from './types.js';
import { fileExists, readFile, writeFile, log, toPosixPath } from './utils.js';

export class GitignoreManager {
  private readonly START_MARKER = '# START Ruler Generated Files';
  private readonly END_MARKER = '# END Ruler Generated Files';
  private verbose: boolean = false;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  async updateGitignore(agents: AgentDefinition[], projectRoot: string): Promise<void> {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    
    log('Updating .gitignore file', this.verbose);

    // Collect all paths that should be ignored
    const pathsToIgnore = this.collectIgnorePaths(agents);
    
    if (pathsToIgnore.length === 0) {
      log('No paths to add to .gitignore', this.verbose);
      return;
    }

    let existingContent = '';
    if (await fileExists(gitignorePath)) {
      existingContent = await readFile(gitignorePath);
    }

    const updatedContent = this.updateGitignoreContent(existingContent, pathsToIgnore);
    
    await writeFile(gitignorePath, updatedContent);
    log(`Updated .gitignore with ${pathsToIgnore.length} paths`, this.verbose);
  }

  private collectIgnorePaths(agents: AgentDefinition[]): string[] {
    const paths = new Set<string>();

    for (const agent of agents) {
      if (agent.outputPath) {
        paths.add(toPosixPath(agent.outputPath));
      }
      if (agent.outputPathInstructions) {
        paths.add(toPosixPath(agent.outputPathInstructions));
      }
      if (agent.outputPathConfig) {
        paths.add(toPosixPath(agent.outputPathConfig));
      }
    }

    return Array.from(paths).sort();
  }

  private updateGitignoreContent(existingContent: string, pathsToIgnore: string[]): string {
    const lines = existingContent.split('\n');
    
    // Find existing managed block
    const startIndex = lines.findIndex(line => line.trim() === this.START_MARKER);
    const endIndex = lines.findIndex(line => line.trim() === this.END_MARKER);

    let beforeLines: string[] = [];
    let afterLines: string[] = [];

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      // Existing managed block found
      beforeLines = lines.slice(0, startIndex);
      afterLines = lines.slice(endIndex + 1);
    } else {
      // No existing managed block
      beforeLines = existingContent ? lines : [];
      afterLines = [];
    }

    // Remove trailing empty lines from before section
    while (beforeLines.length > 0 && beforeLines[beforeLines.length - 1].trim() === '') {
      beforeLines.pop();
    }

    // Remove leading empty lines from after section
    while (afterLines.length > 0 && afterLines[0].trim() === '') {
      afterLines.shift();
    }

    // Build the new content
    const newLines: string[] = [];
    
    // Add existing content before the managed block
    if (beforeLines.length > 0) {
      newLines.push(...beforeLines);
      newLines.push(''); // Add separator line
    }

    // Add managed block
    newLines.push(this.START_MARKER);
    newLines.push(...pathsToIgnore);
    newLines.push(this.END_MARKER);

    // Add existing content after the managed block
    if (afterLines.length > 0) {
      newLines.push(''); // Add separator line
      newLines.push(...afterLines);
    }

    return newLines.join('\n');
  }
}