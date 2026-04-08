'use strict';

const {
  validate,
  validateBrackets,
  validatePythonIndentation,
  validateCommonIssues,
  getSupportedLanguages,
  getLanguageRules,
} = require('../../src/parsers/syntaxValidator');

describe('SyntaxValidator', () => {
  describe('validate()', () => {
    it('should return error for empty code', () => {
      const result = validate('', 'javascript');
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toMatch(/empty/i);
    });

    it('should return error for unsupported language', () => {
      const result = validate('console.log("hi")', 'ruby');
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toMatch(/unsupported/i);
    });

    it('should validate correct JavaScript code', () => {
      const code = `function hello(name) {
  return 'Hello, ' + name;
}`;
      const result = validate(code, 'javascript');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate correct Python code', () => {
      const code = `def hello(name):
    return f"Hello, {name}"`;
      const result = validate(code, 'python');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate correct TypeScript code', () => {
      const code = `function greet(name: string): string {
  return 'Hello, ' + name;
}`;
      const result = validate(code, 'typescript');
      expect(result.valid).toBe(true);
    });

    it('should validate correct Java code', () => {
      const code = `public class Hello {
    public void greet(String name) {
        System.out.println("Hello, " + name);
    }
}`;
      const result = validate(code, 'java');
      expect(result.valid).toBe(true);
    });

    it('should validate correct Go code', () => {
      const code = `func main() {
\tfmt.Println("Hello, World!")
}`;
      const result = validate(code, 'go');
      expect(result.valid).toBe(true);
    });

    it('should detect unmatched brackets in JavaScript', () => {
      const code = `function broken() {
  if (true) {
    console.log("missing bracket")
  
}`;
      const result = validate(code, 'javascript');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle case-insensitive language names', () => {
      const result = validate('const x = 1;', 'JavaScript');
      expect(result.language).toBe('javascript');
    });

    it('should handle null/undefined input gracefully', () => {
      const result = validate(null, 'javascript');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateBrackets()', () => {
    const jsBrackets = { '{': '}', '(': ')', '[': ']' };

    it('should pass for balanced brackets', () => {
      const result = validateBrackets('{ [( )] }', jsBrackets);
      expect(result.valid).toBe(true);
    });

    it('should fail for unbalanced brackets', () => {
      const result = validateBrackets('{ [ }', jsBrackets);
      expect(result.valid).toBe(false);
    });

    it('should fail for extra closing bracket', () => {
      const result = validateBrackets('}', jsBrackets);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toMatch(/unexpected/i);
    });

    it('should fail for unclosed bracket', () => {
      const result = validateBrackets('{', jsBrackets);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toMatch(/unclosed/i);
    });

    it('should ignore brackets inside strings', () => {
      const result = validateBrackets('var x = "{ [ }";', jsBrackets);
      expect(result.valid).toBe(true);
    });

    it('should ignore brackets inside comments', () => {
      const result = validateBrackets('// { [ }\nvar x = 1;', jsBrackets);
      expect(result.valid).toBe(true);
    });

    it('should ignore brackets inside block comments', () => {
      const result = validateBrackets('/* { [ } */\nvar x = 1;', jsBrackets);
      expect(result.valid).toBe(true);
    });
  });

  describe('validatePythonIndentation()', () => {
    it('should pass for consistent space indentation', () => {
      const code = `def foo():
    x = 1
    if x:
        return x`;
      const result = validatePythonIndentation(code);
      expect(result.valid).toBe(true);
    });

    it('should detect mixed tabs and spaces', () => {
      const code = `def foo():
    x = 1
\treturn x`;
      const result = validatePythonIndentation(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.match(/inconsistent/i))).toBe(true);
    });

    it('should handle empty lines correctly', () => {
      const code = `def foo():
    x = 1

    return x`;
      const result = validatePythonIndentation(code);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateCommonIssues()', () => {
    it('should detect missing colon in Python control statement', () => {
      const code = 'if True\n    pass';
      const result = validateCommonIssues(code, 'python');
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toMatch(/colon/i);
    });

    it('should pass valid Python control statements', () => {
      const code = 'if True:\n    pass';
      const result = validateCommonIssues(code, 'python');
      expect(result.valid).toBe(true);
    });
  });

  describe('getSupportedLanguages()', () => {
    it('should return array of supported languages', () => {
      const langs = getSupportedLanguages();
      expect(langs).toContain('javascript');
      expect(langs).toContain('typescript');
      expect(langs).toContain('python');
      expect(langs).toContain('java');
      expect(langs).toContain('go');
    });
  });

  describe('getLanguageRules()', () => {
    it('should return rules for valid language', () => {
      const rules = getLanguageRules('javascript');
      expect(rules).toBeDefined();
      expect(rules.bracketPairs).toBeDefined();
      expect(rules.keywords).toBeDefined();
    });

    it('should return null for unknown language', () => {
      const rules = getLanguageRules('brainfuck');
      expect(rules).toBeNull();
    });

    it('should be case-insensitive', () => {
      const rules = getLanguageRules('Python');
      expect(rules).toBeDefined();
      expect(rules.indentationBased).toBe(true);
    });
  });
});
