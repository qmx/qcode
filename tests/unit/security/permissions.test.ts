import { parseShellPermissions, validatePermissionRule, getAvailablePermissionTools } from '../../../src/security/permissions.js';

describe('Permission Parser', () => {
  describe('parseShellPermissions', () => {
    it('should extract Shell patterns from allow rules', () => {
      const allow = [
        'Shell(echo *)',
        'Shell(npm run *)', 
        'Read(*.ts)',  // Should be ignored
        'Shell(git status)',
      ];
      const deny = ['Shell(rm *)'];

      const result = parseShellPermissions(allow, deny);

      expect(result.allowPatterns).toEqual([
        'echo *',
        'npm run *',
        'git status',
      ]);
      expect(result.denyPatterns).toEqual(['rm *']);
    });

    it('should extract Shell patterns from deny rules', () => {
      const allow = ['Shell(echo *)'];
      const deny = [
        'Shell(rm *)',
        'Shell(sudo *)',
        'Edit(src/**)',  // Should be ignored
        'Shell(* && *)',
      ];

      const result = parseShellPermissions(allow, deny);

      expect(result.allowPatterns).toEqual(['echo *']);
      expect(result.denyPatterns).toEqual([
        'rm *',
        'sudo *',
        '* && *',
      ]);
    });

    it('should handle empty arrays', () => {
      const result = parseShellPermissions([], []);

      expect(result.allowPatterns).toEqual([]);
      expect(result.denyPatterns).toEqual([]);
    });

    it('should ignore non-Shell rules', () => {
      const allow = [
        'Read(*.ts)',
        'Edit(src/**)',
        'MCP(github, list_repos)',
      ];
      const deny = [
        'Read(secrets/**)',
        'Edit(/etc/**)',
      ];

      const result = parseShellPermissions(allow, deny);

      expect(result.allowPatterns).toEqual([]);
      expect(result.denyPatterns).toEqual([]);
    });
  });

  describe('validatePermissionRule', () => {
    it('should validate correct Shell rules', () => {
      const validRules = [
        'Shell(echo *)',
        'Shell(npm run test)',
        'Shell(git status)',
      ];

      for (const rule of validRules) {
        const result = validatePermissionRule(rule);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it('should validate future permission types', () => {
      const futureRules = [
        'Read(*.ts)',
        'Edit(src/**)',
        'MCP(github, list_repos)',
      ];

      for (const rule of futureRules) {
        const result = validatePermissionRule(rule);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it('should reject invalid format', () => {
      const invalidRules = [
        'echo hello',  // Missing Tool() format
        'Shell',       // Missing parentheses
        'Shell()',     // Empty specifier
        'Shell( )',    // Whitespace-only specifier
        'Unknown(test)', // Unknown tool
      ];

      for (const rule of invalidRules) {
        const result = validatePermissionRule(rule);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should reject dangerous Shell patterns', () => {
      const dangerousRules = [
        'Shell(rm -rf /)',
        'Shell(format c:)',
        'Shell(echo test > /dev/)',
      ];

      for (const rule of dangerousRules) {
        const result = validatePermissionRule(rule);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('dangerous pattern');
      }
    });
  });

  describe('getAvailablePermissionTools', () => {
    it('should return available tools with descriptions', () => {
      const tools = getAvailablePermissionTools();

      expect(tools).toHaveProperty('Shell');
      expect(tools).toHaveProperty('Read');
      expect(tools).toHaveProperty('Edit');
      expect(tools).toHaveProperty('MCP');
      
      expect(tools.Shell).toContain('implemented');
      expect(tools.Read).toContain('placeholder');
      expect(tools.Edit).toContain('placeholder');
      expect(tools.MCP).toContain('placeholder');
    });
  });

  describe('Claude Code compatibility', () => {
    it('should handle Claude Code-style permission arrays', () => {
      // Example from Claude Code documentation
      const allow = [
        'Shell(npm run lint)',
        'Shell(npm run test:*)',
        'Read(~/.zshrc)',
      ];
      const deny = [
        'Shell(curl:*)',
      ];

      const result = parseShellPermissions(allow, deny);

      expect(result.allowPatterns).toContain('npm run lint');
      expect(result.allowPatterns).toContain('npm run test:*');
      expect(result.denyPatterns).toContain('curl:*');
      
      // Non-Shell rules should be ignored
      expect(result.allowPatterns).not.toContain('~/.zshrc');
    });
  });
}); 