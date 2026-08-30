'use strict';

/**
 * Authentication Middleware
 *
 * Provides token-based authentication for all agent API endpoints.
 * Supports Bearer token and API key authentication schemes.
 */

const crypto = require('crypto');

/**
 * In-memory token store for demonstration purposes.
 * In production, use a persistent store (Redis, database, etc.)
 */
const tokenStore = new Map();

/**
 * Default configuration for auth middleware
 */
const DEFAULT_CONFIG = {
  headerName: 'authorization',
  apiKeyHeader: 'x-api-key',
  tokenExpiry: 3600000, // 1 hour in milliseconds
  maxTokensPerUser: 10,
};

/**
 * Generate a secure random token
 * @returns {string} A hex-encoded random token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a token for secure storage
 * @param {string} token - The token to hash
 * @returns {string} SHA-256 hash of the token
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Register a new API key for a user
 * @param {string} userId - The user identifier
 * @param {object} [options] - Optional configuration
 * @param {number} [options.expiry] - Token expiry in milliseconds
 * @returns {{ apiKey: string, expiresAt: number }}
 */
function registerApiKey(userId, options = {}) {
  const expiry = options.expiry || DEFAULT_CONFIG.tokenExpiry;
  const apiKey = generateToken();
  const hashedKey = hashToken(apiKey);
  const expiresAt = Date.now() + expiry;

  tokenStore.set(hashedKey, {
    userId,
    expiresAt,
    createdAt: Date.now(),
    type: 'api_key',
  });

  return { apiKey, expiresAt };
}

/**
 * Validate an API key or Bearer token
 * @param {string} token - The token to validate
 * @returns {{ valid: boolean, userId: string|null, error: string|null }}
 */
function validateToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, userId: null, error: 'Token is required' };
  }

  const hashedToken = hashToken(token);
  const entry = tokenStore.get(hashedToken);

  if (!entry) {
    return { valid: false, userId: null, error: 'Invalid token' };
  }

  if (Date.now() > entry.expiresAt) {
    tokenStore.delete(hashedToken);
    return { valid: false, userId: null, error: 'Token expired' };
  }

  return { valid: true, userId: entry.userId, error: null };
}

/**
 * Revoke a token
 * @param {string} token - The token to revoke
 * @returns {boolean} True if token was found and revoked
 */
function revokeToken(token) {
  if (!token) return false;
  const hashedToken = hashToken(token);
  return tokenStore.delete(hashedToken);
}

/**
 * Extract token from request headers
 * @param {object} headers - The request headers
 * @returns {{ token: string|null, scheme: string|null }}
 */
function extractToken(headers) {
  // Check Bearer token in Authorization header
  const authHeader = headers[DEFAULT_CONFIG.headerName] || headers['Authorization'];
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return { token: parts[1], scheme: 'bearer' };
    }
  }

  // Check API key header
  const apiKey = headers[DEFAULT_CONFIG.apiKeyHeader] || headers['X-Api-Key'];
  if (apiKey) {
    return { token: apiKey, scheme: 'api_key' };
  }

  return { token: null, scheme: null };
}

/**
 * Express middleware for authentication
 * Checks for valid Bearer token or API key in request headers.
 *
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {Function} next - Express next function
 */
function authMiddleware(req, res, next) {
  const { token, scheme } = extractToken(req.headers);

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Provide a Bearer token or API key',
      details: {
        expected: [
          'Authorization: Bearer <token>',
          'X-Api-Key: <api_key>',
        ],
      },
    });
  }

  const validation = validateToken(token);

  if (!validation.valid) {
    return res.status(403).json({
      error: 'Authentication failed',
      message: validation.error,
      scheme,
    });
  }

  // Attach user info to request for downstream handlers
  req.user = {
    id: validation.userId,
    scheme,
  };

  next();
}

/**
 * Clear all tokens (useful for testing)
 */
function clearTokenStore() {
  tokenStore.clear();
}

/**
 * Get the count of active tokens
 * @returns {number}
 */
function getActiveTokenCount() {
  // Clean up expired tokens
  const now = Date.now();
  for (const [key, entry] of tokenStore.entries()) {
    if (now > entry.expiresAt) {
      tokenStore.delete(key);
    }
  }
  return tokenStore.size;
}

module.exports = {
  authMiddleware,
  generateToken,
  hashToken,
  registerApiKey,
  validateToken,
  revokeToken,
  extractToken,
  clearTokenStore,
  getActiveTokenCount,
  DEFAULT_CONFIG,
};
