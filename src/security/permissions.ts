/**
 * Permission parsing utilities for Claude Code-style permission rules
 */

export interface ShellPermissions {
  allowPatterns: string[];
  denyPatterns: string[];
}

/**
 * Parses Claude Code-style permission rules and extracts Shell permissions
 */
export function parseShellPermissions(allow: string[], deny: string[]): ShellPermissions {
  const result: ShellPermissions = {
    allowPatterns: [],
    denyPatterns: [],
  };

  // Extract Shell() patterns from allow rules
  for (const rule of allow) {
    const shellPattern = extractShellPattern(rule);
    if (shellPattern) {
      result.allowPatterns.push(shellPattern);
    }
  }

  // Extract Shell() patterns from deny rules
  for (const rule of deny) {
    const shellPattern = extractShellPattern(rule);
    if (shellPattern) {
      result.denyPatterns.push(shellPattern);
    }
  }

  return result;
}

/**
 * Extracts the command pattern from a Shell() permission rule
 * Shell(echo *) -> "echo *"
 * Read(*.ts) -> null (not a shell rule)
 */
function extractShellPattern(rule: string): string | null {
  const shellMatch = rule.match(/^Shell\((.+)\)$/);
  return shellMatch?.[1] ?? null;
}

/**
 * Validates that a permission rule has the correct Claude Code format
 */
export function validatePermissionRule(rule: string): { valid: boolean; error?: string } {
  // Check basic format: Tool(specifier)
  const basicMatch = rule.match(/^([A-Za-z]+)\((.+)\)$/);
  if (!basicMatch) {
    return {
      valid: false,
      error: 'Permission rule must be in format Tool(specifier), e.g., Shell(echo *)',
    };
  }

  const tool = basicMatch[1];
  const specifier = basicMatch[2];

  if (!tool || !specifier) {
    return {
      valid: false,
      error: 'Invalid permission rule format',
    };
  }

  // Validate known tools
  const knownTools = ['Shell', 'Read', 'Edit', 'MCP'];
  if (!knownTools.includes(tool)) {
    return {
      valid: false,
      error: `Unknown tool "${tool}". Supported tools: ${knownTools.join(', ')}`,
    };
  }

  // Validate specifier is not empty
  if (!specifier.trim()) {
    return {
      valid: false,
      error: 'Tool specifier cannot be empty',
    };
  }

  // Tool-specific validation
  if (tool === 'Shell') {
    return validateShellSpecifier(specifier);
  }

  // For future tools (Read, Edit, MCP), just basic validation for now
  return { valid: true };
}

/**
 * Validates Shell command specifiers
 */
function validateShellSpecifier(specifier: string): { valid: boolean; error?: string } {
  // Check for obviously dangerous patterns
  const dangerousPatterns = ['rm -rf /', 'format c:', '> /dev/'];
  for (const dangerous of dangerousPatterns) {
    if (specifier.includes(dangerous)) {
      return {
        valid: false,
        error: `Shell specifier contains dangerous pattern: ${dangerous}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Gets available permission tools and their descriptions
 */
export function getAvailablePermissionTools(): Record<string, string> {
  return {
    Shell: 'Command execution (implemented)',
    Read: 'File reading operations (placeholder)',
    Edit: 'File editing operations (placeholder)', 
    MCP: 'MCP server tool access (placeholder)',
  };
} 