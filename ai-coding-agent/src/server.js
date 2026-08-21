'use strict';

/**
 * API Server
 *
 * Express server exposing the AI coding agent endpoints:
 * - POST /generate - Generate code from prompt + context
 * - POST /debug    - Analyze code snippet and return fixes
 * - POST /explain  - Return explanation for given code block
 */

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { authMiddleware, registerApiKey } = require('./middleware/auth');
const { handleGenerate, handleDebug, handleExplain } = require('./agent/core');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security Middleware ────────────────────────────────────────────────────

app.use(helmet());
app.use(express.json({ limit: '512kb' }));

// Rate limiting: 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    data: null,
    meta: { error: 'Too many requests, please try again later' },
  },
});

app.use(limiter);

// ─── Health Check (no auth required) ────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    supportedLanguages: ['python', 'javascript', 'typescript', 'java', 'go'],
  });
});

// ─── Auth Registration (for demo/dev purposes) ─────────────────────────────

app.post('/auth/register', (req, res) => {
  const { userId } = req.body || {};
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({
      status: 'error',
      data: null,
      meta: { error: 'userId is required and must be a string' },
    });
  }

  const { apiKey, expiresAt } = registerApiKey(userId);
  res.status(201).json({
    status: 'success',
    data: {
      apiKey,
      expiresAt: new Date(expiresAt).toISOString(),
    },
    meta: {
      message: 'Use this API key in the X-Api-Key header or as a Bearer token',
    },
  });
});

// ─── Protected Agent Endpoints ──────────────────────────────────────────────

// Apply authentication to all agent routes
app.use('/generate', authMiddleware);
app.use('/debug', authMiddleware);
app.use('/explain', authMiddleware);

/**
 * POST /generate
 * Generate code from a natural language prompt
 *
 * Request body:
 *   { prompt: string, language: string, code?: string, style_config?: object }
 *
 * Response:
 *   { id, status, timestamp, data: { code, language, validation }, meta }
 */
app.post('/generate', async (req, res) => {
  try {
    const startTime = Date.now();
    const result = await handleGenerate(req.body);
    const elapsed = Date.now() - startTime;

    result.meta.responseTimeMs = elapsed;
    res.status(result.status === 'success' ? 200 : 400).json(result);
  } catch (err) {
    console.error('Generate error:', err.message);
    res.status(500).json({
      status: 'error',
      data: null,
      meta: { error: 'Internal server error' },
    });
  }
});

/**
 * POST /debug
 * Analyze code for bugs and suggest fixes
 *
 * Request body:
 *   { code: string, language: string }
 *
 * Response:
 *   { id, status, timestamp, data: { issues, syntaxErrors, suggestions }, meta }
 */
app.post('/debug', async (req, res) => {
  try {
    const startTime = Date.now();
    const result = await handleDebug(req.body);
    const elapsed = Date.now() - startTime;

    result.meta.responseTimeMs = elapsed;
    res.status(result.status === 'success' ? 200 : 400).json(result);
  } catch (err) {
    console.error('Debug error:', err.message);
    res.status(500).json({
      status: 'error',
      data: null,
      meta: { error: 'Internal server error' },
    });
  }
});

/**
 * POST /explain
 * Generate an explanation for a code block
 *
 * Request body:
 *   { code: string, language: string }
 *
 * Response:
 *   { id, status, timestamp, data: { explanation, structure, complexity }, meta }
 */
app.post('/explain', async (req, res) => {
  try {
    const startTime = Date.now();
    const result = await handleExplain(req.body);
    const elapsed = Date.now() - startTime;

    result.meta.responseTimeMs = elapsed;
    res.status(result.status === 'success' ? 200 : 400).json(result);
  } catch (err) {
    console.error('Explain error:', err.message);
    res.status(500).json({
      status: 'error',
      data: null,
      meta: { error: 'Internal server error' },
    });
  }
});

// ─── Error Handling ─────────────────────────────────────────────────────────

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    status: 'error',
    data: null,
    meta: {
      error: 'Endpoint not found',
      availableEndpoints: [
        'GET  /health',
        'POST /auth/register',
        'POST /generate',
        'POST /debug',
        'POST /explain',
      ],
    },
  });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    status: 'error',
    data: null,
    meta: { error: 'Internal server error' },
  });
});

// ─── Start Server ───────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AI Coding Agent server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log('Supported languages: Python, JavaScript, TypeScript, Java, Go');
  });
}

module.exports = app;
