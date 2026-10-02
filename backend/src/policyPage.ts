import { POLICY_UPDATED } from "@rizz/shared";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function policyPage(title: string, sections: readonly { title: string; body: string }[]) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Rizz AI</title><style>body{margin:0;background:#0b0b0c;color:#fafafa;font:17px/1.7 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:40px 24px}h1{font-size:38px;line-height:1.2}h2{font-size:22px;color:#d3ff54;margin-top:32px}a{color:#d3ff54}small{color:#aaa}</style></head><body><main><nav><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></nav><h1>${escape(title)}</h1><small>Updated ${POLICY_UPDATED}</small>${sections.map((s) => `<section><h2>${escape(s.title)}</h2><p>${escape(s.body)}</p></section>`).join("")}</main></body></html>`;
}
