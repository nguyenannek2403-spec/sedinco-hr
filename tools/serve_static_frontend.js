/**
 * tools/serve_static_frontend.js
 * 
 * Máy chủ tĩnh độc lập phục vụ bản build Frontend tại cổng 4173 (Topo Hai Địa Chỉ - Mục B.1).
 * Không có API nội bộ, hoàn toàn tách biệt với Backend cổng 5001.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.STATIC_PORT || 4173);
const HOST = process.env.STATIC_HOST || '127.0.0.1';
const ROOT_DIR = path.resolve(__dirname, '../zalo-miniapp-frontend/www');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    let reqPath = decodeURIComponent(parsedUrl.pathname);

    let filePath = path.join(ROOT_DIR, reqPath);

    // Kiểm tra an toàn Directory Traversal
    if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    // Nếu là thư mục, trỏ về index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    // SPA Fallback: nếu file không tồn tại, trả về index.html
    if (!fs.existsSync(filePath)) {
        filePath = path.join(ROOT_DIR, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Build files not found. Please run "npm run build" first.');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500);
            return res.end('Internal Server Error');
        }
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(data);
    });
});

server.listen(PORT, HOST, () => {
    console.log(`🚀 [FRONTEND STATIC SERVER] Đang phục vụ tại http://${HOST}:${PORT}`);
    console.log(`📁 Thư mục gốc: ${ROOT_DIR}`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
