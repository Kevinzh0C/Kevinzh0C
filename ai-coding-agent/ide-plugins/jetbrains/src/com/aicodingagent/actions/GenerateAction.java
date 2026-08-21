package com.aicodingagent.actions;

import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.CommonDataKeys;
import com.intellij.openapi.command.WriteCommandAction;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.Messages;
import org.jetbrains.annotations.NotNull;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * JetBrains action for generating code via the AI Coding Agent API.
 *
 * Prompts the user for a natural language description, sends it to the
 * agent server, and inserts the generated code at the cursor position.
 */
public class GenerateAction extends AnAction {

    private static final String DEFAULT_SERVER_URL = "http://localhost:3000";

    @Override
    public void actionPerformed(@NotNull AnActionEvent event) {
        Project project = event.getProject();
        Editor editor = event.getData(CommonDataKeys.EDITOR);

        if (project == null || editor == null) {
            return;
        }

        // Prompt user for input
        String prompt = Messages.showInputDialog(
                project,
                "Describe the code you want to generate:",
                "AI Agent: Generate Code",
                Messages.getQuestionIcon()
        );

        if (prompt == null || prompt.trim().isEmpty()) {
            return;
        }

        // Detect language from file extension
        String language = detectLanguage(event);
        if (language == null) {
            Messages.showWarningDialog(
                    project,
                    "Unsupported file type. Supported: JS, TS, Python, Java, Go",
                    "AI Agent"
            );
            return;
        }

        // Call API and insert result
        try {
            String requestBody = String.format(
                    "{\"prompt\":\"%s\",\"language\":\"%s\"}",
                    escapeJson(prompt),
                    language
            );

            String response = callApi("/generate", requestBody);

            // Simple JSON extraction for the code field
            String generatedCode = extractJsonField(response, "code");
            if (generatedCode != null && !generatedCode.isEmpty()) {
                WriteCommandAction.runWriteCommandAction(project, () -> {
                    int offset = editor.getCaretModel().getOffset();
                    editor.getDocument().insertString(offset, generatedCode);
                });
            } else {
                Messages.showErrorDialog(project, "No code generated", "AI Agent");
            }
        } catch (Exception e) {
            Messages.showErrorDialog(
                    project,
                    "Error: " + e.getMessage(),
                    "AI Agent"
            );
        }
    }

    private String detectLanguage(@NotNull AnActionEvent event) {
        var file = event.getData(CommonDataKeys.VIRTUAL_FILE);
        if (file == null) return null;

        String ext = file.getExtension();
        if (ext == null) return null;

        switch (ext.toLowerCase()) {
            case "js": return "javascript";
            case "ts": return "typescript";
            case "py": return "python";
            case "java": return "java";
            case "go": return "go";
            default: return null;
        }
    }

    private String callApi(String endpoint, String body) throws Exception {
        URL url = new URL(DEFAULT_SERVER_URL + endpoint);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("X-Api-Key", getApiKey());
        conn.setDoOutput(true);
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(10000);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(body.getBytes(StandardCharsets.UTF_8));
        }

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            return sb.toString();
        }
    }

    private String getApiKey() {
        // In production, retrieve from settings service
        return "";
    }

    private String escapeJson(String input) {
        return input
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    private String extractJsonField(String json, String field) {
        String pattern = "\"" + field + "\":\"";
        int start = json.indexOf(pattern);
        if (start == -1) return null;
        start += pattern.length();
        int end = json.indexOf("\"", start);
        while (end > 0 && json.charAt(end - 1) == '\\') {
            end = json.indexOf("\"", end + 1);
        }
        if (end == -1) return null;
        return json.substring(start, end)
                .replace("\\n", "\n")
                .replace("\\t", "\t")
                .replace("\\\"", "\"")
                .replace("\\\\", "\\");
    }
}
