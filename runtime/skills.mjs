// Custom skills: skills/*.md with a small frontmatter block. Synced into the workbench skill
// library (and published) every time the daemon starts. Built-in skills live in store.js.
//
// ---
// slug: my-skill            (lowercase letters, digits, -)
// name: 显示名称
// category: workflow | capability | style | purpose
// description: 一句话说明
// triggers: 关键词,逗号分隔
// tools: doc_read, doc_preview, text_create   (required for workflow / capability: the agent may only use these; style / purpose leave empty)
// ---
// Markdown body = the steps the agent receives from skill_load.
import fs from 'node:fs';
import path from 'node:path';

export function parseSkill(text, file = 'skill.md') {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${file}：缺少 --- frontmatter ---`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-zA-Z]+)\s*:\s*(.*)$/.exec(line.trim());
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  if (!meta.slug || !meta.name) throw new Error(`${file}：frontmatter 需要 slug 和 name`);
  return {
    slug: meta.slug, name: meta.name, category: meta.category || 'workflow',
    description: meta.description || '', triggers: meta.triggers || '',
    tools: (meta.tools || '').split(/[,，\s]+/).filter(Boolean),
    body: m[2].trim(),
  };
}

export function loadSkills(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !/^readme\.md$/i.test(f))
    .sort()
    .map((f) => parseSkill(fs.readFileSync(path.join(dir, f), 'utf8'), f));
}
