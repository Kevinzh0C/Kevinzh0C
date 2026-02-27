'use strict';

/**
 * Syntax Validator
 *
 * Language-specific syntax validation for generated code.
 * Supports Python, JavaScript, TypeScript, Java, and Go.
 */

/**
 * Common syntax rules per language
 */
const LANGUAGE_RULES = {
  javascript: {
    bracketPairs: { '{': '}', '(': ')', '[': ']' },
    stringDelimiters: ['\'', '"', '`'],
    lineCommentPrefix: '//',
    blockCommentStart: '/*',
    blockCommentEnd: '*/',
    semicolonRequired: false,
    keywords: [
      'const', 'let', 'var', 'function', 'class', 'return',
      'if', 'else', 'for', 'while', 'switch', 'case',
      'import', 'export', 'default', 'async', 'await',
      'try', 'catch', 'finally', 'throw', 'new', 'typeof',
    ],
  },
  typescript: {
    bracketPairs: { '{': '}', '(': ')', '[': ']', '<': '>' },
    stringDelimiters: ['\'', '"', '`'],
    lineCommentPrefix: '//',
    blockCommentStart: '/*',
    blockCommentEnd: '*/',
    semicolonRequired: false,
    keywords: [
      'const', 'let', 'var', 'function', 'class', 'return',
      'if', 'else', 'for', 'while', 'switch', 'case',
      'import', 'export', 'default', 'async', 'await',
      'try', 'catch', 'finally', 'throw', 'new', 'typeof',
      'interface', 'type', 'enum', 'namespace', 'declare',
    ],
  },
  python: {
    bracketPairs: { '{': '}', '(': ')', '[': ']' },
    stringDelimiters: ['\'', '"'],
    lineCommentPrefix: '#',
    blockCommentStart: '"""',
    blockCommentEnd: '"""',
    semicolonRequired: false,
    indentationBased: true,
    keywords: [
      'def', 'class', 'return', 'if', 'elif', 'else',
      'for', 'while', 'import', 'from', 'as', 'try',
      'except', 'finally', 'raise', 'with', 'yield',
      'lambda', 'pass', 'break', 'continue', 'and',
      'or', 'not', 'in', 'is', 'None', 'True', 'False',
    ],
  },
  java: {
    bracketPairs: { '{': '}', '(': ')', '[': ']', '<': '>' },
    stringDelimiters: ['"'],
    lineCommentPrefix: '//',
    blockCommentStart: '/*',
    blockCommentEnd: '*/',
    semicolonRequired: true,
    keywords: [
      'public', 'private', 'protected', 'static', 'final',
      'class', 'interface', 'extends', 'implements', 'return',
      'if', 'else', 'for', 'while', 'switch', 'case',
      'import', 'package', 'try', 'catch', 'finally',
      'throw', 'throws', 'new', 'void', 'int', 'boolean',
      'String', 'double', 'float', 'long', 'char',
    ],
  },
  go: {
    bracketPairs: { '{': '}', '(': ')', '[': ']' },
    stringDelimiters: ['"', '`'],
    lineCommentPrefix: '//',
    blockCommentStart: '/*',
    blockCommentEnd: '*/',
    semicolonRequired: false,
    keywords: [
      'func', 'package', 'import', 'return', 'if', 'else',
      'for', 'range', 'switch', 'case', 'default', 'type',
      'struct', 'interface', 'map', 'chan', 'go', 'defer',
      'select', 'var', 'const', 'break', 'continue',
    ],
  },
};

/**
 * Check that all brackets are properly matched
 * @param {string} code - Source code to check
 * @param {object} bracketPairs - Map of opening to closing brackets
 * @returns {{ valid: boolean, errors: Array<{ line: number, message: string }> }}
 */
function validateBrackets(code, bracketPairs) {
  const errors = [];
  const stack = [];
  const lines = code.split('\n');
  const closingToOpening = {};

  for (const [open, close] of Object.entries(bracketPairs)) {
    closingToOpening[close] = open;
  }

  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    inLineComment = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      // Handle block comment
      if (inBlockComment) {
        if (char === '*' && nextChar === '/') {
          inBlockComment = false;
          i++;
        }
        continue;
      }

      // Handle line comment
      if (inLineComment) continue;

      // Handle string literals
      if (inString) {
        if (char === '\\') {
          i++; // skip escaped character
          continue;
        }
        if (char === stringChar) {
          inString = false;
        }
        continue;
      }

      // Check for comment start
      if (char === '/' && nextChar === '/') {
        inLineComment = true;
        continue;
      }
      if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        i++;
        continue;
      }
      if (char === '#') {
        inLineComment = true;
        continue;
      }

      // Check for string start
      if (char === '\'' || char === '"' || char === '`') {
        inString = true;
        stringChar = char;
        continue;
      }

      // Check brackets
      if (bracketPairs[char]) {
        stack.push({ char, line: lineIdx + 1 });
      } else if (closingToOpening[char]) {
        if (stack.length === 0) {
          errors.push({
            line: lineIdx + 1,
            message: `Unexpected closing bracket '${char}'`,
          });
        } else {
          const top = stack.pop();
          if (top.char !== closingToOpening[char]) {
            errors.push({
              line: lineIdx + 1,
              message: `Mismatched bracket: expected '${bracketPairs[top.char]}' but found '${char}'`,
            });
          }
        }
      }
    }
  }

  // Report unclosed brackets
  while (stack.length > 0) {
    const unclosed = stack.pop();
    errors.push({
      line: unclosed.line,
      message: `Unclosed bracket '${unclosed.char}'`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check Python indentation consistency
 * @param {string} code - Python source code
 * @returns {{ valid: boolean, errors: Array<{ line: number, message: string }> }}
 */
function validatePythonIndentation(code) {
  const errors = [];
  const lines = code.split('\n');
  let expectedIndentUnit = null;
  let useTabs = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines and comments
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const leadingWhitespace = line.match(/^(\s*)/)[1];

    if (leadingWhitespace.length === 0) continue;

    const hasTabs = leadingWhitespace.includes('\t');
    const hasSpaces = leadingWhitespace.includes(' ');

    // Mixed tabs and spaces
    if (hasTabs && hasSpaces) {
      errors.push({
        line: i + 1,
        message: 'Mixed tabs and spaces in indentation',
      });
      continue;
    }

    // Detect indentation type
    if (useTabs === null && leadingWhitespace.length > 0) {
      useTabs = hasTabs;
    } else if (useTabs !== null) {
      if (useTabs && hasSpaces) {
        errors.push({
          line: i + 1,
          message: 'Inconsistent indentation: expected tabs, found spaces',
        });
      } else if (!useTabs && hasTabs) {
        errors.push({
          line: i + 1,
          message: 'Inconsistent indentation: expected spaces, found tabs',
        });
      }
    }

    // Check indentation unit consistency
    if (!useTabs && hasSpaces && leadingWhitespace.length > 0) {
      if (expectedIndentUnit === null) {
        expectedIndentUnit = leadingWhitespace.length;
      } else if (leadingWhitespace.length % expectedIndentUnit !== 0) {
        errors.push({
          line: i + 1,
          message: `Inconsistent indentation: expected multiple of ${expectedIndentUnit} spaces`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check for common syntax issues
 * @param {string} code - Source code
 * @param {string} language - Target language
 * @returns {{ valid: boolean, errors: Array<{ line: number, message: string }> }}
 */
function validateCommonIssues(code, language) {
  const errors = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and comments
    if (line === '' || line.startsWith('//') || line.startsWith('#') || line.startsWith('/*')) {
      continue;
    }

    // Check for unclosed strings on a single line (simple heuristic)
    // Reserved for future use: string quote matching validation

    // Java: check for missing semicolons on statement lines
    if (language === 'java') {
      const isStatementLine = !line.endsWith('{') &&
        !line.endsWith('}') &&
        !line.startsWith('//') &&
        !line.startsWith('*') &&
        !line.startsWith('import') &&
        !line.startsWith('package') &&
        !line.startsWith('@') &&
        !line.endsWith(',') &&
        line.length > 0;

      if (isStatementLine && !line.endsWith(';') && !line.endsWith(')')) {
        // Heuristic: only flag obvious statement lines
        const looksLikeStatement = /^(return |System\.|[a-zA-Z]+ [a-zA-Z]+ = )/.test(line);
        if (looksLikeStatement) {
          errors.push({
            line: i + 1,
            message: 'Possible missing semicolon',
          });
        }
      }
    }

    // Python: check for missing colons after control statements
    if (language === 'python') {
      const controlPattern = /^(if |elif |else|for |while |def |class |with |try|except|finally)/;
      if (controlPattern.test(line) && !line.endsWith(':') && !line.endsWith(':\\')) {
        errors.push({
          line: i + 1,
          message: 'Missing colon at end of control statement',
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate code against language-specific syntax rules
 * @param {string} code - The source code to validate
 * @param {string} language - The target language
 * @returns {{ valid: boolean, language: string, errors: Array<{ line: number, message: string }>, warnings: string[] }}
 */
function validate(code, language) {
  const warnings = [];

  if (typeof code !== 'string' || code.trim() === '') {
    return {
      valid: false,
      language,
      errors: [{ line: 0, message: 'Code is empty or not a string' }],
      warnings,
    };
  }

  const lang = (language || '').toLowerCase();
  const rules = LANGUAGE_RULES[lang];

  if (!rules) {
    return {
      valid: false,
      language: lang,
      errors: [{ line: 0, message: `Unsupported language: ${language}` }],
      warnings,
    };
  }

  const allErrors = [];

  // 1. Bracket validation
  const bracketResult = validateBrackets(code, rules.bracketPairs);
  allErrors.push(...bracketResult.errors);

  // 2. Python-specific indentation check
  if (lang === 'python') {
    const indentResult = validatePythonIndentation(code);
    allErrors.push(...indentResult.errors);
  }

  // 3. Common syntax issues
  const commonResult = validateCommonIssues(code, lang);
  allErrors.push(...commonResult.errors);

  return {
    valid: allErrors.length === 0,
    language: lang,
    errors: allErrors,
    warnings,
  };
}

/**
 * Get the list of supported languages
 * @returns {string[]}
 */
function getSupportedLanguages() {
  return Object.keys(LANGUAGE_RULES);
}

/**
 * Get language-specific rules
 * @param {string} language - The target language
 * @returns {object|null}
 */
function getLanguageRules(language) {
  return LANGUAGE_RULES[(language || '').toLowerCase()] || null;
}

module.exports = {
  validate,
  validateBrackets,
  validatePythonIndentation,
  validateCommonIssues,
  getSupportedLanguages,
  getLanguageRules,
  LANGUAGE_RULES,
};
