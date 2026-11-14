/**
 * Minimal Chrome DevTools Protocol (CDP) controller for headless Brave Browser.
 * Uses Node 26 built-in WebSocket + fetch with zero screenshot bloat.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const BRAVE_BINARY = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

class CdpSession {
    constructor(wsUrl, childProc, userDataDir) {
        this.wsUrl = wsUrl;
        this.childProc = childProc;
        this.userDataDir = userDataDir;
        this.ws = null;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
    }

    async connect() {
        await new Promise((resolve, reject) => {
            const ws = new WebSocket(this.wsUrl);
            this.ws = ws;
            ws.addEventListener('open', resolve);
            ws.addEventListener('error', (err) => reject(err?.error || new Error('CDP WebSocket error')));
            ws.addEventListener('message', (evt) => {
                const msg = JSON.parse(String(evt.data));
                if (msg.id && this.pending.has(msg.id)) {
                    const { resolve: res, reject: rej } = this.pending.get(msg.id);
                    this.pending.delete(msg.id);
                    if (msg.error) rej(new Error(`CDP ${msg.error.code}: ${msg.error.message}`));
                    else res(msg.result);
                } else if (msg.method && this.listeners.has(msg.method)) {
                    for (const fn of this.listeners.get(msg.method)) {
                        try { fn(msg.params); } catch { /* ignore listener errors */ }
                    }
                }
            });
        });
    }

    on(method, fn) {
        if (!this.listeners.has(method)) this.listeners.set(method, []);
        this.listeners.get(method).push(fn);
    }

    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP timeout on ${method}`));
            }, 15000);
            this.pending.set(id, {
                resolve: (val) => { clearTimeout(timer); resolve(val); },
                reject: (err) => { clearTimeout(timer); reject(err); }
            });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const res = await this.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true
        });
        if (res.exceptionDetails) {
            throw new Error(`Page eval exception: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`);
        }
        return res.result ? res.result.value : undefined;
    }

    async close() {
        try { if (this.ws && this.ws.readyState <= 1) this.ws.close(); } catch { /* ignore */ }
        try { this.childProc.kill('SIGKILL'); } catch { /* ignore */ }
        try { fs.rmSync(this.userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}

async function launchHeadlessBrave() {
    if (!fs.existsSync(BRAVE_BINARY)) {
        throw new Error(`Brave Browser binary not found at ${BRAVE_BINARY}`);
    }
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sedinco-qa-cdp-'));
    const child = spawn(
        BRAVE_BINARY,
        [
            '--headless=new',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--remote-debugging-port=0',
            `--user-data-dir=${userDataDir}`,
            'about:blank'
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    const wsBaseUrl = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Brave DevTools startup timeout')), 12000);
        const onData = (chunk) => {
            const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/);
            if (match) {
                clearTimeout(timer);
                resolve(match[1]);
            }
        };
        child.stderr.on('data', onData);
        child.stdout.on('data', onData);
        child.on('exit', (code) => {
            clearTimeout(timer);
            reject(new Error(`Brave exited early with code ${code}`));
        });
    });

    const portMatch = wsBaseUrl.match(/:(\d+)\//);
    const port = portMatch[1];
    const targetsRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
        child.kill('SIGKILL');
        fs.rmSync(userDataDir, { recursive: true, force: true });
        throw new Error('No inspectable page target in Brave CDP');
    }

    const session = new CdpSession(pageTarget.webSocketDebuggerUrl, child, userDataDir);
    await session.connect();
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Emulation.enable').catch(() => {});
    return session;
}

module.exports = { launchHeadlessBrave, BRAVE_BINARY };

