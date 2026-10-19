import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSkills, parseSkill } from './skills.mjs';

describe('custom skills', () => {
  it('parses frontmatter and body', () => {
    const s = parseSkill('---\nslug: my-skill\nname: 我的\ncategory: capability\ntools: doc_read, doc_preview，text_create\n---\n# 步骤\n1. 读文档\n');
    expect(s).toEqual({ slug: 'my-skill', name: '我的', category: 'capability', description: '', triggers: '', tools: ['doc_read', 'doc_preview', 'text_create'], body: '# 步骤\n1. 读文档' });
  });

  it('rejects files without frontmatter or slug', () => {
    expect(() => parseSkill('# no meta')).toThrow(/frontmatter/);
    expect(() => parseSkill('---\nname: x\n---\nbody')).toThrow(/slug/);
  });

  it('loads the repo skills folder (README excluded)', () => {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills');
    const skills = loadSkills(dir);
    expect(skills.map((s) => s.slug)).toContain('style-swiss-minimal');
    expect(skills.every((s) => s.body.length > 0)).toBe(true);
  });
});
