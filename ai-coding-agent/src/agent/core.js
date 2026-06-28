'use strict';

/**
 * Agent Core - Main Orchestration Logic
 *
 * Coordinates the input parsing, context analysis, code generation,
 * validation, and output formatting pipeline for all agent operations.
 */

const { v4: uuidv4 } = require('uuid');
const { generateCode, debugCode, explainCode } = require('../generators/codeGenerator');
const { sanitizeRequestBody, validateFilePath } = require('../utils/sanitizer');

/**
 * Request timeout in milliseconds (10 seconds per PRD)
 */
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Maximum input size in bytes (512KB per PRD memory cap guidance)
 */
const MAX_INPUT_SIZE = 512 * 1024;

/**
 * Agent operation status codes
 */
const STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
  VALIDATION_FAILED: 'validation_failed',
  TIMEOUT: 'timeout',
};

/**
 * Create a standardized response envelope
 * @param {string} status - Response status
 * @param {object} data - Response payload
 * @param {object} [meta] - Additional metadata
 * @returns {object}
 */
function createResponse(status, data, meta = {}) {
  return {
    id: uuidv4(),
    status,
    timestamp: new Date().toISOString(),
    data,
    meta: {
      ...meta,
      agentVersion: '1.0.0',
    },
  };
}

/**
 * Validate the incoming request body size and structure
 * @param {object} body - The raw request body
 * @returns {{ valid: boolean, error: string|null }}
 */
function validateRequest(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const bodySize = JSON.stringify(body).length;
  if (bodySize > MAX_INPUT_SIZE) {
    return { valid: false, error: `Request body exceeds maximum size of ${MAX_INPUT_SIZE} bytes` };
  }

  return { valid: true, error: null };
}

/**
 * Execute a function with a timeout
 * @param {Function} fn - The function to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<any>}
 */
function withTimeout(fn, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      const result = fn();
      clearTimeout(timer);
      resolve(result);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

/**
 * Handle code generation request
 *
 * Pipeline: sanitize input → parse prompt → generate code → validate → format output
 *
 * @param {object} body - Request body with { prompt, language, code, style_config }
 * @returns {object} Standardized response
 */
async function handleGenerate(body) {
  // 1. Validate request
  const reqValidation = validateRequest(body);
  if (!reqValidation.valid) {
    return createResponse(STATUS.ERROR, null, { error: reqValidation.error });
  }

  // 2. Sanitize input
  const { sanitized, warnings } = sanitizeRequestBody(body);

  if (!sanitized.prompt) {
    return createResponse(STATUS.ERROR, null, {
      error: 'A prompt is required for code generation',
    });
  }

  if (!sanitized.language) {
    return createResponse(STATUS.ERROR, null, {
      error: 'A valid language is required (python, javascript, typescript, java, go)',
    });
  }

  try {
    // 3. Generate code with timeout
    const result = await withTimeout(() => generateCode({
      prompt: sanitized.prompt,
      language: sanitized.language,
      style_config: sanitized.style_config,
      code: sanitized.code,
    }));

    // 4. Return formatted response
    return createResponse(STATUS.SUCCESS, {
      code: result.code,
      language: result.language,
      validation: result.metadata.validation,
    }, {
      warnings: [...warnings, ...result.metadata.warnings],
      generatedAt: result.metadata.generatedAt,
    });
  } catch (err) {
    if (err.message.includes('timed out')) {
      return createResponse(STATUS.TIMEOUT, null, {
        error: 'Code generation timed out',
      });
    }
    return createResponse(STATUS.ERROR, null, {
      error: err.message,
    });
  }
}

/**
 * Handle code debugging request
 *
 * Pipeline: sanitize input → analyze code → detect bugs → suggest fixes
 *
 * @param {object} body - Request body with { code, language }
 * @returns {object} Standardized response
 */
async function handleDebug(body) {
  // 1. Validate request
  const reqValidation = validateRequest(body);
  if (!reqValidation.valid) {
    return createResponse(STATUS.ERROR, null, { error: reqValidation.error });
  }

  // 2. Sanitize input
  const { sanitized, warnings } = sanitizeRequestBody(body);

  if (!sanitized.code) {
    return createResponse(STATUS.ERROR, null, {
      error: 'Code is required for debugging',
    });
  }

  if (!sanitized.language) {
    return createResponse(STATUS.ERROR, null, {
      error: 'A valid language is required (python, javascript, typescript, java, go)',
    });
  }

  try {
    // 3. Debug code with timeout
    const result = await withTimeout(() => debugCode({
      code: sanitized.code,
      language: sanitized.language,
    }));

    // 4. Return formatted response
    return createResponse(STATUS.SUCCESS, {
      issues: result.issues,
      syntaxErrors: result.syntaxErrors,
      suggestions: result.suggestions,
      issueCount: result.issues.length,
      syntaxErrorCount: result.syntaxErrors.length,
    }, {
      warnings,
    });
  } catch (err) {
    if (err.message.includes('timed out')) {
      return createResponse(STATUS.TIMEOUT, null, {
        error: 'Debug analysis timed out',
      });
    }
    return createResponse(STATUS.ERROR, null, {
      error: err.message,
    });
  }
}

/**
 * Handle code explanation request
 *
 * Pipeline: sanitize input → analyze structure → generate explanation
 *
 * @param {object} body - Request body with { code, language }
 * @returns {object} Standardized response
 */
async function handleExplain(body) {
  // 1. Validate request
  const reqValidation = validateRequest(body);
  if (!reqValidation.valid) {
    return createResponse(STATUS.ERROR, null, { error: reqValidation.error });
  }

  // 2. Sanitize input
  const { sanitized, warnings } = sanitizeRequestBody(body);

  if (!sanitized.code) {
    return createResponse(STATUS.ERROR, null, {
      error: 'Code is required for explanation',
    });
  }

  if (!sanitized.language) {
    return createResponse(STATUS.ERROR, null, {
      error: 'A valid language is required (python, javascript, typescript, java, go)',
    });
  }

  try {
    // 3. Explain code with timeout
    const result = await withTimeout(() => explainCode({
      code: sanitized.code,
      language: sanitized.language,
    }));

    // 4. Return formatted response
    return createResponse(STATUS.SUCCESS, {
      explanation: result.explanation,
      structure: result.structure,
      complexity: result.complexity,
    }, {
      warnings,
    });
  } catch (err) {
    if (err.message.includes('timed out')) {
      return createResponse(STATUS.TIMEOUT, null, {
        error: 'Explanation generation timed out',
      });
    }
    return createResponse(STATUS.ERROR, null, {
      error: err.message,
    });
  }
}

/**
 * Validate a file path for workspace safety
 * @param {string} filePath - The file path to check
 * @param {string} workspaceRoot - The allowed workspace root
 * @returns {{ allowed: boolean, error: string|null }}
 */
function checkFileAccess(filePath, workspaceRoot) {
  const result = validateFilePath(filePath, workspaceRoot);
  return {
    allowed: result.valid,
    normalizedPath: result.normalized,
    error: result.error,
  };
}

module.exports = {
  handleGenerate,
  handleDebug,
  handleExplain,
  createResponse,
  validateRequest,
  withTimeout,
  checkFileAccess,
  STATUS,
  REQUEST_TIMEOUT_MS,
  MAX_INPUT_SIZE,
};
