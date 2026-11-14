/**
 * Suite 01 — AST Syntax, Import Resolution, React Scope & Static Safety Audit
 */
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const BE_SRC = path.join(ROOT_DIR, 'sedinco_backend/src');
const FE_SRC = path.join(ROOT_DIR, 'zalo-miniapp-frontend/src');
const parser = require(path.join(ROOT_DIR, 'zalo-miniapp-frontend/node_modules/@babel/parser'));

function walkFiles(dir, exts) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walkFiles(full, exts));
        else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(full);
    }
    return out.sort();
}

function resolveRelativeImport(fromFile, spec) {
    if (!spec.startsWith('.')) return true;
    const base = path.resolve(path.dirname(fromFile), spec);
    const candidates = [
        base,
        `${base}.js`,
        `${base}.jsx`,
        `${base}.json`,
        `${base}.scss`,
        `${base}.css`,
        path.join(base, 'index.js'),
        path.join(base, 'index.jsx')
    ];
    return candidates.some((c) => fs.existsSync(c));
}

test('AST-01: Parse all Backend JS modules and resolve local require() paths', () => {
    const files = walkFiles(BE_SRC, ['.js']);
    assert.ok(files.length >= 25, `Expected >=25 backend source files, found ${files.length}`);
    const errors = [];

    for (const file of files) {
        const code = fs.readFileSync(file, 'utf8');
        let ast;
        try {
            ast = parser.parse(code, { sourceType: 'script', plugins: ['dynamicImport'] });
        } catch (err) {
            errors.push(`${path.relative(ROOT_DIR, file)}: parse error: ${err.message}`);
            continue;
        }
        const walkNode = (node) => {
            if (!node || typeof node !== 'object') return;
            if (
                node.type === 'CallExpression' &&
                node.callee?.type === 'Identifier' &&
                node.callee.name === 'require' &&
                node.arguments?.[0]?.type === 'StringLiteral'
            ) {
                const reqPath = node.arguments[0].value;
                if (reqPath.startsWith('.') && !resolveRelativeImport(file, reqPath)) {
                    errors.push(`${path.relative(ROOT_DIR, file)}: unresolved require("${reqPath}")`);
                }
            }
            for (const key of Object.keys(node)) {
                const val = node[key];
                if (Array.isArray(val)) val.forEach(walkNode);
                else if (val && typeof val === 'object' && val.type) walkNode(val);
            }
        };
        walkNode(ast.program);
    }
    assert.deepEqual(errors, [], `Backend AST/import errors:\n${errors.join('\n')}`);
});

test('AST-02: Parse all Frontend JS/JSX modules and verify local imports & safe dialogs', () => {
    const files = walkFiles(FE_SRC, ['.js', '.jsx']);
    assert.ok(files.length >= 25, `Expected >=25 frontend source files, found ${files.length}`);
    const errors = [];

    for (const file of files) {
        const code = fs.readFileSync(file, 'utf8');
        const rel = path.relative(ROOT_DIR, file);
        let ast;
        try {
            ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
        } catch (err) {
            errors.push(`${rel}: JSX parse error: ${err.message}`);
            continue;
        }

        const checkNode = (node) => {
            if (!node || typeof node !== 'object') return;
            if (node.type === 'ImportDeclaration' && node.source?.type === 'StringLiteral') {
                const spec = node.source.value;
                if (spec.startsWith('.') && !resolveRelativeImport(file, spec)) {
                    errors.push(`${rel}: unresolved import "${spec}"`);
                }
            }
            if (node.type === 'CallExpression') {
                const callee = node.callee;
                if (
                    callee?.type === 'MemberExpression' &&
                    callee.object?.name === 'window' &&
                    ['confirm', 'alert', 'prompt'].includes(callee.property?.name)
                ) {
                    errors.push(`${rel}: forbidden window.${callee.property.name}()`);
                }
            }
            if (node.type === 'Identifier' && /^activeData$/i.test(node.name)) {
                errors.push(`${rel}: suspicious variable "${node.name}"`);
            }
            for (const key of Object.keys(node)) {
                const val = node[key];
                if (Array.isArray(val)) val.forEach(checkNode);
                else if (val && typeof val === 'object' && val.type) checkNode(val);
            }
        };
        checkNode(ast.program);
    }
    assert.deepEqual(errors, [], `Frontend AST/safety issues:\n${errors.join('\n')}`);
});

test('AST-03: Anti-Hang & Production Hardening — DB connectTimeout configured & zero dead auth routes in FE', () => {
    const dbCode = fs.readFileSync(path.join(BE_SRC, 'config/db.js'), 'utf8');
    assert.match(dbCode, /connectTimeout\s*:\s*\d+/, 'sedinco_backend/src/config/db.js must configure connectTimeout (Anti-Hang Policy)');

    const authSvcCode = fs.readFileSync(path.join(FE_SRC, 'services/authService.js'), 'utf8');
    assert.ok(!authSvcCode.includes('"/session"'), 'FE authService must not call non-existent /session endpoint');
    assert.ok(!authSvcCode.includes('"/auth/link-preview"'), 'FE authService must not call non-existent /auth/link-preview');
    assert.ok(!authSvcCode.includes('"/auth/link"'), 'FE authService must not call non-existent /auth/link');
});

