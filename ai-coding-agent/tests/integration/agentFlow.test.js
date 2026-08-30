'use strict';

const request = require('supertest');
const app = require('../../src/server');
const { registerApiKey, clearTokenStore } = require('../../src/middleware/auth');

let apiKey;

beforeAll(() => {
  const result = registerApiKey('test-user');
  apiKey = result.apiKey;
});

afterAll(() => {
  clearTokenStore();
});

describe('Agent API Integration Tests', () => {
  // ─── Health Check ──────────────────────────────────────────────────

  describe('GET /health', () => {
    it('should return health status without auth', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.version).toBe('1.0.0');
      expect(res.body.supportedLanguages).toContain('python');
    });
  });

  // ─── Auth Registration ─────────────────────────────────────────────

  describe('POST /auth/register', () => {
    it('should register a new API key', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ userId: 'new-user' });

      expect(res.status).toBe(201);
      expect(res.body.data.apiKey).toBeDefined();
      expect(res.body.data.expiresAt).toBeDefined();
    });

    it('should reject registration without userId', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ─── Authentication ────────────────────────────────────────────────

  describe('Authentication', () => {
    it('should reject requests without auth', async () => {
      const res = await request(app)
        .post('/generate')
        .send({ prompt: 'test', language: 'javascript' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/authentication/i);
    });

    it('should reject requests with invalid token', async () => {
      const res = await request(app)
        .post('/generate')
        .set('Authorization', 'Bearer invalid-token')
        .send({ prompt: 'test', language: 'javascript' });

      expect(res.status).toBe(403);
    });

    it('should accept requests with valid API key', async () => {
      const res = await request(app)
        .post('/generate')
        .set('X-Api-Key', apiKey)
        .send({ prompt: 'function hello', language: 'javascript' });

      expect(res.status).toBe(200);
    });

    it('should accept requests with valid Bearer token', async () => {
      const res = await request(app)
        .post('/generate')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ prompt: 'function hello', language: 'javascript' });

      expect(res.status).toBe(200);
    });
  });

  // ─── POST /generate ────────────────────────────────────────────────

  describe('POST /generate', () => {
    it('should generate JavaScript code from prompt', async () => {
      const res = await request(app)
        .post('/generate')
        .set('X-Api-Key', apiKey)
        .send({
          prompt: 'function calculateSum with params a, b',
          language: 'javascript',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.code).toBeDefined();
      expect(res.body.data.language).toBe('javascript');
      expect(res.body.data.validation).toBeDefined();
    });

    it('should generate Python code from prompt', async () => {
      const res = await request(app)
        .post('/generate')
        .set('X-Api-Key', apiKey)
        .send({
          prompt: 'def process_data with params data',
          language: 'python',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.language).toBe('python');
    });

    it('should generate TypeScript code from prompt', async () => {
      const res = await request(app)
        .post('/generate')
        .set('X-Api-Key', apiKey)
        .send({
          prompt: 'async function fetchData with params url',
          language: 'typescript',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.language).toBe('typescript');
    });

    it('should generate Go code from prompt', async () => {
      const res = await request(app)
        .post('/generate')
        .set('X-Api-Key', apiKey)
        .send({
          prompt: 'func handleRequest',
          language: 'go',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.language).toBe('go');
    });

    it('should generate Java code from prompt', async () => {
      const res = await request(app)
        .post('/generate')
        .set('X-Api-Key', apiKey)
        .send({
          prompt: 'class UserService',
          language: 'java',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.language).toBe('java');
    });

    it('should reject generation without prompt', async () => {
      const res = await request(app)
        .post('/generate')
        .set('X-Api-Key', apiKey)
        .send({ language: 'javascript' });

      expect(res.status).toBe(400);
      expect(res.body.meta.error).toMatch(/prompt/i);
    });

    it('should reject generation with unsupported language', async () => {
      const res = await request(app)
        .post('/generate')
        .set('X-Api-Key', apiKey)
        .send({ prompt: 'function test', language: 'cobol' });

      expect(res.status).toBe(400);
    });

    it('should apply style configuration', async () => {
      const res = await request(app)
        .post('/generate')
        .set('X-Api-Key', apiKey)
        .send({
          prompt: 'function hello',
          language: 'javascript',
          style_config: { indentation: '    ' },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.code).toBeDefined();
    });

    it('should include response time metadata', async () => {
      const res = await request(app)
        .post('/generate')
        .set('X-Api-Key', apiKey)
        .send({
          prompt: 'function test',
          language: 'javascript',
        });

      expect(res.body.meta.responseTimeMs).toBeDefined();
      expect(res.body.meta.responseTimeMs).toBeLessThan(3000);
    });
  });

  // ─── POST /debug ───────────────────────────────────────────────────

  describe('POST /debug', () => {
    it('should detect issues in JavaScript code', async () => {
      const res = await request(app)
        .post('/debug')
        .set('X-Api-Key', apiKey)
        .send({
          code: 'var x = 1;\nif (x == 1) { console.log(x); }',
          language: 'javascript',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.issues).toBeDefined();
      expect(Array.isArray(res.body.data.issues)).toBe(true);
    });

    it('should detect Python-specific issues', async () => {
      const res = await request(app)
        .post('/debug')
        .set('X-Api-Key', apiKey)
        .send({
          code: 'try:\n    x = 1\nexcept:\n    pass',
          language: 'python',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.issues.length).toBeGreaterThan(0);
    });

    it('should detect syntax errors', async () => {
      const res = await request(app)
        .post('/debug')
        .set('X-Api-Key', apiKey)
        .send({
          code: 'function broken( { return 1; }',
          language: 'javascript',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.syntaxErrors.length).toBeGreaterThan(0);
    });

    it('should return suggestions', async () => {
      const res = await request(app)
        .post('/debug')
        .set('X-Api-Key', apiKey)
        .send({
          code: 'var x = 1;',
          language: 'javascript',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.suggestions).toBeDefined();
    });

    it('should reject debug without code', async () => {
      const res = await request(app)
        .post('/debug')
        .set('X-Api-Key', apiKey)
        .send({ language: 'javascript' });

      expect(res.status).toBe(400);
      expect(res.body.meta.error).toMatch(/code/i);
    });
  });

  // ─── POST /explain ─────────────────────────────────────────────────

  describe('POST /explain', () => {
    it('should explain JavaScript code structure', async () => {
      const code = `
const express = require('express');

function createServer() {
  const app = express();
  app.get('/', (req, res) => res.send('Hello'));
  return app;
}

module.exports = createServer;`;

      const res = await request(app)
        .post('/explain')
        .set('X-Api-Key', apiKey)
        .send({ code, language: 'javascript' });

      expect(res.status).toBe(200);
      expect(res.body.data.explanation).toBeDefined();
      expect(res.body.data.structure).toBeDefined();
      expect(res.body.data.structure.functions.length).toBeGreaterThan(0);
      expect(res.body.data.complexity).toBeDefined();
    });

    it('should explain Python code', async () => {
      const code = `
import os

class FileManager:
    def __init__(self, root):
        self.root = root

    def list_files(self):
        return os.listdir(self.root)

    def read_file(self, name):
        with open(os.path.join(self.root, name)) as f:
            return f.read()`;

      const res = await request(app)
        .post('/explain')
        .set('X-Api-Key', apiKey)
        .send({ code, language: 'python' });

      expect(res.status).toBe(200);
      expect(res.body.data.structure.classes).toContain('FileManager');
      expect(res.body.data.structure.functions.length).toBeGreaterThanOrEqual(1);
    });

    it('should return complexity assessment', async () => {
      const res = await request(app)
        .post('/explain')
        .set('X-Api-Key', apiKey)
        .send({
          code: 'const x = 1;',
          language: 'javascript',
        });

      expect(res.status).toBe(200);
      expect(['low', 'medium', 'high']).toContain(res.body.data.complexity);
    });

    it('should reject explain without code', async () => {
      const res = await request(app)
        .post('/explain')
        .set('X-Api-Key', apiKey)
        .send({ language: 'python' });

      expect(res.status).toBe(400);
    });
  });

  // ─── 404 Handler ───────────────────────────────────────────────────

  describe('404 Handler', () => {
    it('should return 404 for unknown endpoints', async () => {
      const res = await request(app).get('/unknown');
      expect(res.status).toBe(404);
      expect(res.body.meta.availableEndpoints).toBeDefined();
    });
  });

  // ─── Error Handling ────────────────────────────────────────────────

  describe('Error Handling', () => {
    it('should return structured errors for malformed JSON', async () => {
      const res = await request(app)
        .post('/generate')
        .set('X-Api-Key', apiKey)
        .set('Content-Type', 'application/json')
        .send('not json');

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});
