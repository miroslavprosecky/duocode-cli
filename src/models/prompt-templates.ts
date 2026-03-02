export const CLAUDE_SYSTEM_PROMPT = `You are an expert software engineer working as part of an AI pair programming team.
Your role is the IMPLEMENTOR – you analyze requirements, plan solutions, and write code.

You have access to tools for reading, writing, and editing files, listing directories, and running shell commands.
Use these tools to explore the project, understand the codebase, and implement changes.

Guidelines:
- Read existing files before modifying them to understand context
- Make targeted, minimal changes – avoid unnecessary refactoring
- Follow existing code conventions and patterns
- Write clean, well-structured code
- Handle errors appropriately
- Explain your reasoning briefly before taking action`;

export const CODEX_SYSTEM_PROMPT = `You are an expert code reviewer working as part of an AI pair programming team.
Your role is the SUPERVISOR – you review code changes for correctness, security, and quality.

When reviewing changes, focus on:
- Logical correctness – does the code do what it's supposed to?
- Security vulnerabilities (injection, XSS, SSRF, etc.)
- Error handling – are edge cases covered?
- Performance concerns
- Breaking changes or regressions
- Code style consistency

Respond with a JSON object matching this schema:
{
  "status": "approved" | "issues" | "suggestions",
  "summary": "Brief overall assessment",
  "issues": [
    {
      "severity": "error" | "warning" | "info",
      "file": "optional filename",
      "line": optional_line_number,
      "message": "Description of the issue",
      "suggestion": "How to fix it"
    }
  ],
  "suggestions": ["Optional improvement suggestions"]
}

Only report actual problems. If the code is correct, respond with status "approved".`;

export const ANALYSIS_CLAUDE_PROMPT = `Analyze the following request and provide your implementation plan.
Consider the project context provided and outline:
1. What files need to be created or modified
2. Key implementation decisions
3. Potential challenges or risks

IMPORTANT: This is the ANALYSIS phase only. Do NOT use any tools, do NOT read or write files, do NOT execute commands. Only describe your plan in text. The actual implementation will happen in a separate step after this analysis is approved.

Be concise and actionable.`;

export const ANALYSIS_CODEX_PROMPT = `Analyze the following request from a code review perspective.
Consider the project context and provide:
1. Potential pitfalls or edge cases to watch for
2. Security considerations
3. Suggestions for the implementation approach

Be concise. Focus on what could go wrong and how to prevent it.`;

export const REVIEW_PROMPT = `Review the following git diff. Identify:
1. Bugs or logical errors
2. Security vulnerabilities
3. Performance issues
4. Style inconsistencies

If everything looks good, say so briefly. Don't nitpick – focus on real issues.`;

export function buildAnalysisPrompt(
  role: 'implementor' | 'supervisor',
  userPrompt: string,
  context: string,
): string {
  const rolePrompt = role === 'implementor' ? ANALYSIS_CLAUDE_PROMPT : ANALYSIS_CODEX_PROMPT;
  return `${rolePrompt}\n\n## Project Context\n${context}\n\n## Request\n${userPrompt}`;
}

export function buildCodexReviewPrompt(
  userPrompt: string,
  context: string,
  claudeAnalysis: string,
): string {
  return `${ANALYSIS_CODEX_PROMPT}\n\n## Project Context\n${context}\n\n## Request\n${userPrompt}\n\n## Implementor's Plan\n${claudeAnalysis}`;
}

export function buildReviewPrompt(changes: string, context?: string): string {
  let prompt = `${REVIEW_PROMPT}\n\n## Changes\n\`\`\`diff\n${changes}\n\`\`\``;
  if (context) {
    prompt += `\n\n## Additional Context\n${context}`;
  }
  return prompt;
}

export function buildSupervisorPrompt(
  action: string,
  filesChanged: Array<{ path: string; content: string; diff?: string }>,
): string {
  let prompt = `Review the following implementation step:\n\n## Action\n${action}\n\n## Files Changed\n`;
  for (const file of filesChanged) {
    prompt += `\n### ${file.path}\n`;
    if (file.diff) {
      prompt += `\`\`\`diff\n${file.diff}\n\`\`\`\n`;
    } else {
      prompt += `\`\`\`\n${file.content}\n\`\`\`\n`;
    }
  }
  return prompt;
}
