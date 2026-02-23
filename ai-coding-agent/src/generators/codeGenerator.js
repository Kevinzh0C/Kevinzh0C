'use strict';

/**
 * Code Generator
 *
 * LLM integration layer for generating, debugging, and explaining code.
 * Uses template-based generation with configurable style rules as a
 * built-in fallback when no external LLM provider is configured.
 */

const { validate } = require('../parsers/syntaxValidator');
const { sanitizeOutput } = require('../utils/sanitizer');

/**
 * Code templates for common patterns per language
 */
const CODE_TEMPLATES = {
  javascript: {
    function: (name, params, body) =>
      `function ${name}(${params}) {\n  ${body}\n}`,
    class: (name, methods) =>
      `class ${name} {\n  constructor() {\n    // Initialize\n  }\n\n${methods}\n}`,
    arrow: (name, params, body) =>
      `const ${name} = (${params}) => {\n  ${body}\n};`,
    async_function: (name, params, body) =>
      `async function ${name}(${params}) {\n  ${body}\n}`,
  },
  typescript: {
    function: (name, params, body) =>
      `function ${name}(${params}): void {\n  ${body}\n}`,
    class: (name, methods) =>
      `class ${name} {\n  constructor() {\n    // Initialize\n  }\n\n${methods}\n}`,
    interface: (name, fields) =>
      `interface ${name} {\n  ${fields}\n}`,
    async_function: (name, params, body) =>
      `async function ${name}(${params}): Promise<void> {\n  ${body}\n}`,
  },
  python: {
    function: (name, params, body) =>
      `def ${name}(${params}):\n    ${body}`,
    class: (name, methods) =>
      `class ${name}:\n    def __init__(self):\n        pass\n\n${methods}`,
    async_function: (name, params, body) =>
      `async def ${name}(${params}):\n    ${body}`,
  },
  java: {
    function: (name, params, body) =>
      `public void ${name}(${params}) {\n    ${body}\n}`,
    class: (name, methods) =>
      `public class ${name} {\n    public ${name}() {\n        // Initialize\n    }\n\n${methods}\n}`,
    main: (body) =>
      `public static void main(String[] args) {\n    ${body}\n}`,
  },
  go: {
    function: (name, params, body) =>
      `func ${name}(${params}) {\n\t${body}\n}`,
    struct: (name, fields) =>
      `type ${name} struct {\n\t${fields}\n}`,
    main: (body) =>
      `func main() {\n\t${body}\n}`,
  },
};

/**
 * Default style configurations per language
 */
const DEFAULT_STYLES = {
  javascript: {
    indentation: '  ',
    semicolons: true,
    quotes: 'single',
    trailingComma: true,
  },
  typescript: {
    indentation: '  ',
    semicolons: true,
    quotes: 'single',
    trailingComma: true,
  },
  python: {
    indentation: '    ',
    maxLineLength: 79,
    docstrings: true,
  },
  java: {
    indentation: '    ',
    braceStyle: 'same-line',
  },
  go: {
    indentation: '\t',
    braceStyle: 'same-line',
  },
};

/**
 * Apply style configuration to generated code
 * @param {string} code - The generated code
 * @param {string} language - Target language
 * @param {object} styleConfig - Style configuration overrides
 * @returns {string} Styled code
 */
function applyStyle(code, language, styleConfig = {}) {
  const defaults = DEFAULT_STYLES[language] || {};
  const style = { ...defaults, ...styleConfig };

  let result = code;

  // Apply indentation
  if (style.indentation) {
    // Normalize indentation
    result = result.replace(/^( {2}|\t)/gm, style.indentation);
  }

  // Apply quote style for JS/TS
  if ((language === 'javascript' || language === 'typescript') && style.quotes) {
    if (style.quotes === 'single') {
      result = result.replace(/(?<!\\)"/g, '\'');
    } else if (style.quotes === 'double') {
      result = result.replace(/(?<!\\)'/g, '"');
    }
  }

  return result;
}

/**
 * Parse a natural language prompt to extract intent and parameters
 * @param {string} prompt - The natural language prompt
 * @returns {{ intent: string, name: string, params: string, description: string }}
 */
function parsePrompt(prompt) {
  const normalized = prompt.toLowerCase().trim();

  let intent = 'function';
  let name = 'generatedFunction';
  let params = '';
  let description = prompt;

  // Detect intent
  if (/\bclass\b/.test(normalized)) {
    intent = 'class';
    const classMatch = prompt.match(/class\s+(\w+)/i);
    if (classMatch) name = classMatch[1];
  } else if (/\binterface\b/.test(normalized)) {
    intent = 'interface';
    const ifaceMatch = prompt.match(/interface\s+(\w+)/i);
    if (ifaceMatch) name = ifaceMatch[1];
  } else if (/\bstruct\b/.test(normalized)) {
    intent = 'struct';
    const structMatch = prompt.match(/struct\s+(\w+)/i);
    if (structMatch) name = structMatch[1];
  } else if (/\basync\b/.test(normalized)) {
    intent = 'async_function';
    const asyncMatch = prompt.match(/(?:function|def|func)\s+(\w+)/i);
    if (asyncMatch) name = asyncMatch[1];
  } else {
    const funcMatch = prompt.match(/(?:function|def|func|method)\s+(\w+)/i);
    if (funcMatch) name = funcMatch[1];
  }

  // Extract parameters
  const paramMatch = prompt.match(/(?:with|taking|accepts?|params?|parameters?)\s*[:(]?\s*([^)}\]]+)/i);
  if (paramMatch) {
    params = paramMatch[1].trim();
  }

  return { intent, name, params, description };
}

/**
 * Generate code from a natural language prompt
 * @param {object} options - Generation options
 * @param {string} options.prompt - Natural language prompt
 * @param {string} options.language - Target language
 * @param {object} [options.style_config] - Style configuration
 * @param {string} [options.code] - Existing code context
 * @returns {{ code: string, language: string, metadata: object }}
 */
function generateCode({ prompt, language, style_config: styleConfig }) {
  const lang = (language || 'javascript').toLowerCase();
  const templates = CODE_TEMPLATES[lang];

  if (!templates) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const { intent, name, params, description } = parsePrompt(prompt);

  let generated = '';
  const commentPrefix = lang === 'python' ? '#' : '//';
  const header = `${commentPrefix} Generated from prompt: ${description}\n`;

  const templateFn = templates[intent] || templates.function;

  if (!templateFn) {
    throw new Error(`No template for intent '${intent}' in language '${lang}'`);
  }

  const placeholder = lang === 'python' ? 'pass  # TODO: Implement' : '// TODO: Implement';

  if (intent === 'class' || intent === 'struct') {
    generated = header + templateFn(name, `  ${placeholder}`);
  } else if (intent === 'interface') {
    generated = header + templateFn(name, '// TODO: Define fields');
  } else {
    generated = header + templateFn(name, params, placeholder);
  }

  // Apply style configuration
  generated = applyStyle(generated, lang, styleConfig);

  // Validate the generated code
  const validation = validate(generated, lang);

  // Sanitize output
  const { code: sanitizedCode, warnings } = sanitizeOutput(generated);

  return {
    code: sanitizedCode,
    language: lang,
    metadata: {
      intent,
      name,
      params,
      validation,
      warnings,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Common bug patterns per language
 */
const BUG_PATTERNS = {
  javascript: [
    { pattern: /===?\s*undefined\s*\|\|\s*===?\s*null/g, fix: 'Use == null for null/undefined check', severity: 'warning' },
    { pattern: /typeof\s+\w+\s*===?\s*'undefined'/g, fix: 'Consider using optional chaining (?.) instead', severity: 'info' },
    { pattern: /var\s+/g, fix: 'Use const or let instead of var', severity: 'warning' },
    { pattern: /==(?!=)/g, fix: 'Use strict equality (===) instead of loose equality (==)', severity: 'warning' },
  ],
  python: [
    { pattern: /except:/g, fix: 'Avoid bare except; catch specific exceptions', severity: 'warning' },
    { pattern: /== None/g, fix: 'Use "is None" instead of "== None"', severity: 'warning' },
    { pattern: /!= None/g, fix: 'Use "is not None" instead of "!= None"', severity: 'warning' },
    { pattern: /def \w+\([^)]*=\[\]/g, fix: 'Avoid mutable default arguments (use None instead)', severity: 'error' },
  ],
  java: [
    { pattern: /\.equals\(null\)/g, fix: 'Use == null instead of .equals(null)', severity: 'error' },
    { pattern: /catch\s*\(\s*Exception\s+\w+\s*\)\s*\{\s*\}/g, fix: 'Empty catch block swallows exceptions', severity: 'error' },
  ],
  go: [
    { pattern: /if err != nil \{\s*\}/g, fix: 'Empty error handling block', severity: 'error' },
    { pattern: /fmt\.Println\(/g, fix: 'Consider using structured logging instead of fmt.Println', severity: 'info' },
  ],
  typescript: [
    { pattern: /: any\b/g, fix: 'Avoid using "any" type; specify a concrete type', severity: 'warning' },
    { pattern: /as any\b/g, fix: 'Avoid type assertion to "any"', severity: 'warning' },
    { pattern: /var\s+/g, fix: 'Use const or let instead of var', severity: 'warning' },
  ],
};

/**
 * Debug code by analyzing for common bugs and syntax issues
 * @param {object} options - Debug options
 * @param {string} options.code - Code to debug
 * @param {string} options.language - Source language
 * @returns {{ issues: Array<object>, suggestions: string[], syntaxErrors: Array<object> }}
 */
function debugCode({ code, language }) {
  const lang = (language || 'javascript').toLowerCase();
  const issues = [];
  const suggestions = [];

  // Run syntax validation
  const syntaxResult = validate(code, lang);

  // Check for language-specific bug patterns
  const patterns = BUG_PATTERNS[lang] || [];
  const lines = code.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    for (const { pattern, fix, severity } of patterns) {
      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        issues.push({
          line: lineIdx + 1,
          code: line.trim(),
          severity,
          message: fix,
        });
      }
    }
  }

  // Generate suggestions based on found issues
  if (syntaxResult.errors.length > 0) {
    suggestions.push('Fix syntax errors before addressing other issues');
  }
  if (issues.filter(i => i.severity === 'error').length > 0) {
    suggestions.push('Address error-level issues first as they may cause runtime failures');
  }
  if (issues.filter(i => i.severity === 'warning').length > 0) {
    suggestions.push('Review warning-level issues for potential improvements');
  }

  return {
    issues,
    suggestions,
    syntaxErrors: syntaxResult.errors,
  };
}

/**
 * Generate an explanation for a code block
 * @param {object} options - Explain options
 * @param {string} options.code - Code to explain
 * @param {string} options.language - Source language
 * @returns {{ explanation: string, structure: object, complexity: string }}
 */
function explainCode({ code, language }) {
  const lang = (language || 'javascript').toLowerCase();
  const lines = code.split('\n');
  const nonEmptyLines = lines.filter(l => l.trim() !== '');

  // Analyze code structure
  const structure = {
    totalLines: lines.length,
    codeLines: nonEmptyLines.length,
    functions: [],
    classes: [],
    imports: [],
    comments: 0,
  };

  const functionPatterns = {
    javascript: /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>)/,
    typescript: /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*(?::\s*\w+)?\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>)/,
    python: /def\s+(\w+)/,
    java: /(?:public|private|protected|static|\s)+[\w<>[\]]+\s+(\w+)\s*\(/,
    go: /func\s+(?:\([^)]+\)\s+)?(\w+)/,
  };

  const classPatterns = {
    javascript: /class\s+(\w+)/,
    typescript: /class\s+(\w+)/,
    python: /class\s+(\w+)/,
    java: /class\s+(\w+)/,
    go: /type\s+(\w+)\s+struct/,
  };

  const importPatterns = {
    javascript: /(?:import|require)\s/,
    typescript: /(?:import|require)\s/,
    python: /(?:import|from)\s/,
    java: /import\s/,
    go: /import\s/,
  };

  const commentPrefixes = {
    javascript: '//',
    typescript: '//',
    python: '#',
    java: '//',
    go: '//',
  };

  const funcPattern = functionPatterns[lang];
  const classPattern = classPatterns[lang];
  const importPattern = importPatterns[lang];
  const commentPrefix = commentPrefixes[lang] || '//';

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith(commentPrefix) || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      structure.comments++;
      continue;
    }

    if (funcPattern) {
      const funcMatch = trimmed.match(funcPattern);
      if (funcMatch) {
        structure.functions.push(funcMatch[1] || funcMatch[2]);
      }
    }

    if (classPattern) {
      const classMatch = trimmed.match(classPattern);
      if (classMatch) {
        structure.classes.push(classMatch[1]);
      }
    }

    if (importPattern && importPattern.test(trimmed)) {
      structure.imports.push(trimmed);
    }
  }

  // Determine complexity (simple heuristic)
  let complexity = 'low';
  if (nonEmptyLines.length > 50 || structure.functions.length > 5) {
    complexity = 'medium';
  }
  if (nonEmptyLines.length > 200 || structure.functions.length > 15 || structure.classes.length > 3) {
    complexity = 'high';
  }

  // Generate explanation
  const parts = [];
  parts.push(`This ${lang} code contains ${structure.codeLines} lines of code.`);

  if (structure.imports.length > 0) {
    parts.push(`It imports ${structure.imports.length} module(s).`);
  }

  if (structure.classes.length > 0) {
    parts.push(`It defines ${structure.classes.length} class(es): ${structure.classes.join(', ')}.`);
  }

  if (structure.functions.length > 0) {
    parts.push(`It contains ${structure.functions.length} function(s): ${structure.functions.join(', ')}.`);
  }

  if (structure.comments > 0) {
    const ratio = ((structure.comments / structure.totalLines) * 100).toFixed(1);
    parts.push(`Comment coverage: ${ratio}% (${structure.comments} comment lines).`);
  }

  parts.push(`Estimated complexity: ${complexity}.`);

  return {
    explanation: parts.join('\n'),
    structure,
    complexity,
  };
}

module.exports = {
  generateCode,
  debugCode,
  explainCode,
  applyStyle,
  parsePrompt,
  CODE_TEMPLATES,
  DEFAULT_STYLES,
  BUG_PATTERNS,
};
