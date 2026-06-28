# AI Coding Agent

An AI-powered coding agent that integrates into IDEs to provide real-time code generation, debugging, and refactoring assistance via natural language prompts and contextual analysis.

## Features

- **Code Generation**: Generate syntactically correct code from natural language prompts
- **Code Debugging**: Identify bugs, syntax errors, and common anti-patterns with suggested fixes
- **Code Explanation**: Analyze code structure, complexity, and provide human-readable explanations
- **Multi-Language Support**: Python, JavaScript, TypeScript, Java, and Go
- **IDE Integration**: VS Code extension and JetBrains plugin scaffolds included
- **Security**: Input sanitization, path traversal prevention, sensitive data redaction, and token-based authentication

## Architecture

```
src/
├── agent/
│   └── core.js              # Main orchestration logic (pipeline coordination)
├── parsers/
│   └── syntaxValidator.js    # Language-specific syntax validation
├── generators/
│   └── codeGenerator.js      # Code generation, debugging, and explanation engine
├── utils/
│   └── sanitizer.js          # Input/output sanitization and security utilities
├── middleware/
│   └── auth.js               # Token-based authentication middleware
└── server.js                 # Express API server

tests/
├── unit/
│   └── syntaxValidator.test.js
└── integration/
    └── agentFlow.test.js

ide-plugins/
├── vscode/                   # VS Code extension (v1.70+)
│   ├── package.json
│   └── extension.js
└── jetbrains/                # JetBrains plugin (IntelliJ 2022.3+)
    ├── plugin.xml
    └── src/
```

## Quick Start

### Prerequisites

- Node.js >= 18.x
- npm >= 9.x

### Installation

```bash
cd ai-coding-agent
npm install
```

### Running the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server starts on `http://localhost:3000` by default (configurable via `PORT` env var).

### Running Tests

```bash
# Run all tests with coverage
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration
```

### Linting

```bash
npm run lint
```

## API Endpoints

All agent endpoints require authentication. First register for an API key:

### Register (No Auth Required)

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"userId": "my-user"}'
```

Response:
```json
{
  "status": "success",
  "data": {
    "apiKey": "<your-api-key>",
    "expiresAt": "2024-01-01T01:00:00.000Z"
  }
}
```

### Health Check (No Auth Required)

```bash
curl http://localhost:3000/health
```

### POST /generate

Generate code from a natural language prompt.

```bash
curl -X POST http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <your-api-key>" \
  -d '{
    "prompt": "async function fetchUserData with params userId",
    "language": "typescript",
    "style_config": { "indentation": "  " }
  }'
```

### POST /debug

Analyze code for bugs and get fix suggestions.

```bash
curl -X POST http://localhost:3000/debug \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <your-api-key>" \
  -d '{
    "code": "var x = 1;\nif (x == true) { console.log(x); }",
    "language": "javascript"
  }'
```

### POST /explain

Get a structural explanation of a code block.

```bash
curl -X POST http://localhost:3000/explain \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <your-api-key>" \
  -d '{
    "code": "class UserService {\n  constructor(db) {\n    this.db = db;\n  }\n  async findById(id) {\n    return this.db.query(id);\n  }\n}",
    "language": "javascript"
  }'
```

## Request Schema

All agent endpoints accept JSON with the following fields:

| Field          | Type   | Required | Description                          |
|----------------|--------|----------|--------------------------------------|
| `prompt`       | string | generate | Natural language code description    |
| `code`         | string | debug/explain | Source code to analyze          |
| `language`     | string | yes      | Target language (python, javascript, typescript, java, go) |
| `style_config` | object | no       | Style rules (indentation, quotes, etc.) |

## Authentication

The API supports two authentication schemes:

1. **API Key Header**: `X-Api-Key: <key>`
2. **Bearer Token**: `Authorization: Bearer <token>`

## Security Features

- **Input Sanitization**: Null bytes, injection patterns, and dangerous code constructs are detected and blocked
- **Output Sanitization**: Generated code is scanned for accidentally included secrets (API keys, passwords, private keys)
- **Path Traversal Prevention**: File operations are restricted to the project workspace root
- **Rate Limiting**: 100 requests per minute per IP
- **Request Size Limit**: 512KB maximum request body
- **Request Timeout**: 10-second timeout per operation
- **XSS Prevention**: HTML output is escaped for safe rendering in IDE UIs
- **Helmet.js**: Standard HTTP security headers applied

## IDE Plugins

### VS Code Extension

Located in `ide-plugins/vscode/`. Compatible with VS Code v1.70+.

**Commands:**
- `AI Agent: Generate Code` — Generate code from a prompt
- `AI Agent: Debug Code` — Analyze selected code for bugs
- `AI Agent: Explain Code` — Get an explanation of selected code

**Settings:**
- `aiCodingAgent.serverUrl` — Agent server URL (default: `http://localhost:3000`)
- `aiCodingAgent.apiKey` — API key for authentication

### JetBrains Plugin

Located in `ide-plugins/jetbrains/`. Compatible with IntelliJ IDEA 2022.3+.

**Keyboard Shortcuts:**
- `Ctrl+Alt+G` — Generate Code
- `Ctrl+Alt+D` — Debug Code
- `Ctrl+Alt+E` — Explain Code

## Supported Languages

| Language    | Generation | Debugging | Explanation |
|-------------|:----------:|:---------:|:-----------:|
| JavaScript  |     ✓      |     ✓     |      ✓      |
| TypeScript  |     ✓      |     ✓     |      ✓      |
| Python      |     ✓      |     ✓     |      ✓      |
| Java        |     ✓      |     ✓     |      ✓      |
| Go          |     ✓      |     ✓     |      ✓      |

## Technical Constraints

- **Performance**: ≤3s response time; 10s timeout and 512KB memory cap per request
- **Security**: All user inputs sanitized; no shell/command execution; file access restricted to project root
- **Compatibility**: VS Code v1.70+, IntelliJ IDEA 2022.3+

## License

MIT
