'use strict';

/**
 * VS Code Extension for AI Coding Agent
 *
 * Integrates with the AI Coding Agent server to provide:
 * - Code generation from natural language prompts
 * - Code debugging and bug detection
 * - Code explanation and structure analysis
 *
 * Compatible with VS Code v1.70+
 */

const vscode = require('vscode');
const https = require('https');
const http = require('http');

/**
 * Make an HTTP request to the agent server
 * @param {string} endpoint - API endpoint path
 * @param {object} body - Request body
 * @returns {Promise<object>} Response data
 */
function callAgentApi(endpoint, body) {
  const config = vscode.workspace.getConfiguration('aiCodingAgent');
  const serverUrl = config.get('serverUrl', 'http://localhost:3000');
  const apiKey = config.get('apiKey', '');

  const url = new URL(endpoint, serverUrl);
  const transport = url.protocol === 'https:' ? https : http;

  const postData = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'X-Api-Key': apiKey,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Get the active editor's language ID mapped to agent language
 * @returns {string|null}
 */
function getActiveLanguage() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;

  const langMap = {
    javascript: 'javascript',
    typescript: 'typescript',
    python: 'python',
    java: 'java',
    go: 'go',
  };

  return langMap[editor.document.languageId] || null;
}

/**
 * Get selected text or full document text
 * @returns {{ code: string, hasSelection: boolean }}
 */
function getCodeFromEditor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return { code: '', hasSelection: false };

  const selection = editor.selection;
  if (!selection.isEmpty) {
    return {
      code: editor.document.getText(selection),
      hasSelection: true,
    };
  }

  return {
    code: editor.document.getText(),
    hasSelection: false,
  };
}

/**
 * Activate the extension
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('AI Coding Agent extension activated');

  // ─── Generate Command ──────────────────────────────────────────

  const generateCmd = vscode.commands.registerCommand(
    'aiCodingAgent.generate',
    async () => {
      const language = getActiveLanguage();
      if (!language) {
        vscode.window.showWarningMessage(
          'AI Agent: Open a supported file (JS, TS, Python, Java, Go)'
        );
        return;
      }

      const prompt = await vscode.window.showInputBox({
        prompt: 'Describe the code you want to generate',
        placeHolder: 'e.g., function to sort an array of objects by key',
      });

      if (!prompt) return;

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'AI Agent: Generating code...',
            cancellable: false,
          },
          async () => {
            const result = await callAgentApi('/generate', {
              prompt,
              language,
            });

            if (result.status === 'success' && result.data.code) {
              const editor = vscode.window.activeTextEditor;
              if (editor) {
                editor.edit((editBuilder) => {
                  editBuilder.insert(editor.selection.active, result.data.code);
                });
              }
            } else {
              vscode.window.showErrorMessage(
                `AI Agent: ${result.meta?.error || 'Generation failed'}`
              );
            }
          }
        );
      } catch (err) {
        vscode.window.showErrorMessage(`AI Agent Error: ${err.message}`);
      }
    }
  );

  // ─── Debug Command ─────────────────────────────────────────────

  const debugCmd = vscode.commands.registerCommand(
    'aiCodingAgent.debug',
    async () => {
      const language = getActiveLanguage();
      if (!language) {
        vscode.window.showWarningMessage(
          'AI Agent: Open a supported file (JS, TS, Python, Java, Go)'
        );
        return;
      }

      const { code } = getCodeFromEditor();
      if (!code.trim()) {
        vscode.window.showWarningMessage('AI Agent: No code to debug');
        return;
      }

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'AI Agent: Analyzing code...',
            cancellable: false,
          },
          async () => {
            const result = await callAgentApi('/debug', { code, language });

            if (result.status === 'success') {
              const panel = vscode.window.createWebviewPanel(
                'aiAgentDebug',
                'AI Agent: Debug Results',
                vscode.ViewColumn.Beside,
                {}
              );

              const issues = result.data.issues || [];
              const syntaxErrors = result.data.syntaxErrors || [];
              const suggestions = result.data.suggestions || [];

              panel.webview.html = `
                <!DOCTYPE html>
                <html>
                <head>
                  <style>
                    body { font-family: var(--vscode-font-family); padding: 16px; }
                    h2 { color: var(--vscode-editor-foreground); }
                    .issue { margin: 8px 0; padding: 8px; border-left: 3px solid; }
                    .error { border-color: #f44336; background: rgba(244,67,54,0.1); }
                    .warning { border-color: #ff9800; background: rgba(255,152,0,0.1); }
                    .info { border-color: #2196f3; background: rgba(33,150,243,0.1); }
                    .suggestion { color: var(--vscode-descriptionForeground); }
                  </style>
                </head>
                <body>
                  <h2>Debug Results</h2>
                  <p>${issues.length} issue(s), ${syntaxErrors.length} syntax error(s)</p>
                  ${syntaxErrors.map(e => `<div class="issue error"><strong>Line ${e.line}:</strong> ${e.message}</div>`).join('')}
                  ${issues.map(i => `<div class="issue ${i.severity}"><strong>Line ${i.line}:</strong> ${i.message}<br><code>${i.code}</code></div>`).join('')}
                  ${suggestions.length > 0 ? '<h3>Suggestions</h3>' + suggestions.map(s => `<p class="suggestion">${s}</p>`).join('') : ''}
                </body>
                </html>
              `;
            } else {
              vscode.window.showErrorMessage(
                `AI Agent: ${result.meta?.error || 'Debug failed'}`
              );
            }
          }
        );
      } catch (err) {
        vscode.window.showErrorMessage(`AI Agent Error: ${err.message}`);
      }
    }
  );

  // ─── Explain Command ───────────────────────────────────────────

  const explainCmd = vscode.commands.registerCommand(
    'aiCodingAgent.explain',
    async () => {
      const language = getActiveLanguage();
      if (!language) {
        vscode.window.showWarningMessage(
          'AI Agent: Open a supported file (JS, TS, Python, Java, Go)'
        );
        return;
      }

      const { code } = getCodeFromEditor();
      if (!code.trim()) {
        vscode.window.showWarningMessage('AI Agent: No code to explain');
        return;
      }

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'AI Agent: Analyzing code...',
            cancellable: false,
          },
          async () => {
            const result = await callAgentApi('/explain', { code, language });

            if (result.status === 'success') {
              const panel = vscode.window.createWebviewPanel(
                'aiAgentExplain',
                'AI Agent: Code Explanation',
                vscode.ViewColumn.Beside,
                {}
              );

              const { explanation, structure, complexity } = result.data;

              panel.webview.html = `
                <!DOCTYPE html>
                <html>
                <head>
                  <style>
                    body { font-family: var(--vscode-font-family); padding: 16px; }
                    h2 { color: var(--vscode-editor-foreground); }
                    .stat { margin: 4px 0; }
                    .complexity { display: inline-block; padding: 2px 8px; border-radius: 4px; }
                    .low { background: #4caf50; color: white; }
                    .medium { background: #ff9800; color: white; }
                    .high { background: #f44336; color: white; }
                    pre { background: var(--vscode-editor-background); padding: 12px; border-radius: 4px; }
                  </style>
                </head>
                <body>
                  <h2>Code Explanation</h2>
                  <span class="complexity ${complexity}">${complexity.toUpperCase()} complexity</span>
                  <pre>${explanation}</pre>
                  <h3>Structure</h3>
                  <div class="stat">Lines: ${structure.totalLines} total, ${structure.codeLines} code</div>
                  <div class="stat">Functions: ${(structure.functions || []).join(', ') || 'none'}</div>
                  <div class="stat">Classes: ${(structure.classes || []).join(', ') || 'none'}</div>
                  <div class="stat">Imports: ${structure.imports?.length || 0}</div>
                  <div class="stat">Comments: ${structure.comments || 0} lines</div>
                </body>
                </html>
              `;
            } else {
              vscode.window.showErrorMessage(
                `AI Agent: ${result.meta?.error || 'Explanation failed'}`
              );
            }
          }
        );
      } catch (err) {
        vscode.window.showErrorMessage(`AI Agent Error: ${err.message}`);
      }
    }
  );

  context.subscriptions.push(generateCmd, debugCmd, explainCmd);
}

/**
 * Deactivate the extension
 */
function deactivate() {
  console.log('AI Coding Agent extension deactivated');
}

module.exports = { activate, deactivate };
