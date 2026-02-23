'use strict';

/**
 * Input/Output Sanitizer
 *
 * Provides sanitization utilities to prevent injection attacks,
 * path traversal, and XSS in IDE UI rendering.
 */

const path = require('path');

/**
 * Dangerous patterns that could indicate injection attempts
 */
const DANGEROUS_PATTERNS = [
  /\bexec\s*\(/i,
  /\beval\s*\(/i,
  /\bchild_process/i,
  /\brequire\s*\(\s*['"]child_process['"]\s*\)/i,
  /\bspawn\s*\(/i,
  /\bexecSync\s*\(/i,
  /`[^`]*\$\{[^}]*\}[^`]*`/,
  /\bprocess\.env/i,
  /\b__proto__\b/,
  /\bconstructor\s*\[/,
];

/**
 * Sensitive patterns that should not appear in generated output
 */
const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
  /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/gi,
  /(?:secret|token)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
  /(?:aws_access_key_id|aws_secret_access_key)\s*[:=]\s*['"][^'"]+['"]/gi,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
  /(?:ssh-rsa|ssh-ed25519)\s+[A-Za-z0-9+/=]{40,}/g,
];

/**
 * HTML entities for XSS prevention
 */
const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&#x27;',
  '/': '&#x2F;',
};

/**
 * Sanitize a string input by trimming and removing null bytes
 * @param {string} input - The input string to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeString(input) {
  if (typeof input !== 'string') {
    return '';
  }
  return input
    .replace(/\0/g, '')
    .trim();
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - The string to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (typeof str !== 'string') {
    return '';
  }
  return str.replace(/[&<>"'/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Check if input contains dangerous patterns (injection attempts)
 * @param {string} input - The input to check
 * @returns {{ safe: boolean, matches: string[] }}
 */
function detectInjection(input) {
  if (typeof input !== 'string') {
    return { safe: true, matches: [] };
  }

  const matches = [];
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(input)) {
      matches.push(pattern.source);
    }
  }

  return {
    safe: matches.length === 0,
    matches,
  };
}

/**
 * Check if output contains sensitive data patterns
 * @param {string} output - The output to check
 * @returns {{ clean: boolean, redacted: string }}
 */
function redactSensitiveData(output) {
  if (typeof output !== 'string') {
    return { clean: true, redacted: '' };
  }

  let redacted = output;
  let foundSensitive = false;

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(redacted)) {
      foundSensitive = true;
      redacted = redacted.replace(pattern, '[REDACTED]');
    }
  }

  return {
    clean: !foundSensitive,
    redacted,
  };
}

/**
 * Validate and normalize a file path to prevent path traversal
 * @param {string} filePath - The file path to validate
 * @param {string} projectRoot - The allowed project root directory
 * @returns {{ valid: boolean, normalized: string|null, error: string|null }}
 */
function validateFilePath(filePath, projectRoot) {
  if (typeof filePath !== 'string' || typeof projectRoot !== 'string') {
    return { valid: false, normalized: null, error: 'Invalid path or project root' };
  }

  const normalizedRoot = path.resolve(projectRoot);
  const normalizedPath = path.resolve(normalizedRoot, filePath);

  if (!normalizedPath.startsWith(normalizedRoot)) {
    return {
      valid: false,
      normalized: null,
      error: 'Path traversal detected: path escapes project root',
    };
  }

  return {
    valid: true,
    normalized: normalizedPath,
    error: null,
  };
}

/**
 * Sanitize the full request body for agent endpoints
 * @param {object} body - The request body
 * @returns {{ sanitized: object, warnings: string[] }}
 */
function sanitizeRequestBody(body) {
  const warnings = [];
  const sanitized = {};

  if (body.code !== undefined) {
    sanitized.code = sanitizeString(body.code);
  }

  if (body.prompt !== undefined) {
    sanitized.prompt = sanitizeString(body.prompt);
    const injectionCheck = detectInjection(sanitized.prompt);
    if (!injectionCheck.safe) {
      warnings.push('Prompt contains potentially dangerous patterns');
    }
  }

  if (body.language !== undefined) {
    const allowedLanguages = ['python', 'javascript', 'typescript', 'java', 'go'];
    const lang = sanitizeString(body.language).toLowerCase();
    if (allowedLanguages.includes(lang)) {
      sanitized.language = lang;
    } else {
      warnings.push(`Unsupported language: ${body.language}`);
      sanitized.language = null;
    }
  }

  if (body.style_config !== undefined) {
    if (typeof body.style_config === 'object' && body.style_config !== null) {
      sanitized.style_config = {};
      for (const [key, value] of Object.entries(body.style_config)) {
        const cleanKey = sanitizeString(key);
        const cleanValue = typeof value === 'string' ? sanitizeString(value) : value;
        sanitized.style_config[cleanKey] = cleanValue;
      }
    } else {
      warnings.push('style_config must be an object');
    }
  }

  return { sanitized, warnings };
}

/**
 * Sanitize generated code output before returning to client
 * @param {string} code - The generated code
 * @returns {{ code: string, warnings: string[] }}
 */
function sanitizeOutput(code) {
  const warnings = [];

  if (typeof code !== 'string') {
    return { code: '', warnings: ['Output is not a string'] };
  }

  const { clean, redacted } = redactSensitiveData(code);
  if (!clean) {
    warnings.push('Sensitive data patterns were redacted from output');
  }

  return { code: redacted, warnings };
}

module.exports = {
  sanitizeString,
  escapeHtml,
  detectInjection,
  redactSensitiveData,
  validateFilePath,
  sanitizeRequestBody,
  sanitizeOutput,
  DANGEROUS_PATTERNS,
  SENSITIVE_PATTERNS,
};
