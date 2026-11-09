/**
 * sedinco_backend/__tests__/import_holidays.test.js
 * 
 * Kiểm thử công cụ tools/import_holidays.js (G9.3 Mục F.1):
 * - TC-G9-HOLIDAY-01: Nhập thành công ngày lễ hợp lệ từ JSON.
 * - TC-G9-HOLIDAY-02: Chế độ --dry-run không thay đổi CSDL.
 * - TC-G9-HOLIDAY-03: Từ chối file có định dạng ngày sai hoặc start_date > end_date.
 * - TC-G9-HOLIDAY-04: Từ chối file có tên ngày lễ trùng lặp nội bộ.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '123456';
const DB_NAME = 'sedinco_hr_test';

const SCRIPT_PATH = path.resolve(__dirname, '../../tools/import_holidays.js');
const TMP_DIR = path.resolve(__dirname, '../temp_holidays');

describe('G9.3 - Mục F.1: Kiểm thử Công Cụ Nhập Ngày Lễ (import_holidays.js)', () => {
    let conn;

    before(async () => {
        if (!fs.existsSync(TMP_DIR)) {
            fs.mkdirSync(TMP_DIR, { recursive: true });
        }
        conn = await mysql.createConnection({
            host: DB_HOST,
            port: DB_PORT,
            user: DB_USER,
            password: DB_PASSWORD,
            database: DB_NAME
        });
        // Dọn dẹp ngày lễ test
        await conn.query("DELETE FROM public_holidays WHERE holiday_name LIKE 'TEST_HOLIDAY_%'");
    });

    after(async () => {
        if (conn) {
            await conn.query("DELETE FROM public_holidays WHERE holiday_name LIKE 'TEST_HOLIDAY_%'");
            await conn.end();
        }
        if (fs.existsSync(TMP_DIR)) {
            fs.rmSync(TMP_DIR, { recursive: true, force: true });
        }
    });

    it('TC-G9-HOLIDAY-01: Nhập thành công dữ liệu ngày lễ hợp lệ và ghi audit log', () => {
        const testFile = path.join(TMP_DIR, 'valid_holidays.json');
        fs.writeFileSync(testFile, JSON.stringify({
            source: 'Test Runner',
            holidays: [
                { holiday_name: 'TEST_HOLIDAY_01', start_date: '2026-12-25', end_date: '2026-12-25' },
                { holiday_name: 'TEST_HOLIDAY_02', start_date: '2026-12-31', end_date: '2027-01-01' }
            ]
        }));

        const res = spawnSync('node', [
            SCRIPT_PATH,
            '--file', testFile,
            '--actor', 'ADMIN_TEST_HOLIDAY'
        ], {
            env: {
                ...process.env,
                ALLOW_DESTRUCTIVE_DB: DB_NAME,
                DB_NAME,
                NODE_ENV: 'test'
            },
            encoding: 'utf8'
        });

        assert.equal(res.status, 0, `Script phải thoát với code 0. Lỗi: ${res.stderr}`);
        assert.ok(res.stdout.includes('Nạp thành công 2 ngày lễ vào CSDL'), 'Phải báo nạp thành công 2 ngày lễ');
    });

    it('TC-G9-HOLIDAY-02: Chế độ --dry-run xác thực dữ liệu nhưng không thay đổi CSDL', async () => {
        const testFile = path.join(TMP_DIR, 'dry_run_holidays.json');
        fs.writeFileSync(testFile, JSON.stringify({
            source: 'Test Dry Run',
            holidays: [
                { holiday_name: 'TEST_HOLIDAY_DRY_01', start_date: '2026-06-01', end_date: '2026-06-01' }
            ]
        }));

        const res = spawnSync('node', [
            SCRIPT_PATH,
            '--file', testFile,
            '--dry-run'
        ], {
            env: { ...process.env, DB_NAME, NODE_ENV: 'test' },
            encoding: 'utf8'
        });

        assert.equal(res.status, 0, 'Dry-run phải thành công');
        assert.ok(res.stdout.includes('[DRY-RUN THÀNH CÔNG]'), 'Phải có thông báo dry-run thành công');

        // Kiểm tra CSDL không có bản ghi này
        const [rows] = await conn.query("SELECT COUNT(*) as cnt FROM public_holidays WHERE holiday_name = 'TEST_HOLIDAY_DRY_01'");
        assert.equal(rows[0].cnt, 0, 'Không được có bản ghi trong DB khi chạy dry-run');
    });

    it('TC-G9-HOLIDAY-03: Từ chối file có định dạng ngày sai hoặc start_date > end_date', () => {
        const testFile = path.join(TMP_DIR, 'invalid_date_holidays.json');
        fs.writeFileSync(testFile, JSON.stringify({
            holidays: [
                { holiday_name: 'TEST_HOLIDAY_INVALID', start_date: '2026-05-10', end_date: '2026-05-01' }
            ]
        }));

        const res = spawnSync('node', [
            SCRIPT_PATH,
            '--file', testFile,
            '--dry-run'
        ], {
            env: { ...process.env, DB_NAME, NODE_ENV: 'test' },
            encoding: 'utf8'
        });

        assert.equal(res.status, 1, 'Script phải từ chối với exit code 1');
        assert.ok(res.stderr.includes('lớn hơn end_date'), 'Phải có thông báo lỗi start_date lớn hơn end_date');
    });

    it('TC-G9-HOLIDAY-04: Từ chối file có tên ngày lễ trùng lặp nội bộ', () => {
        const testFile = path.join(TMP_DIR, 'duplicate_holidays.json');
        fs.writeFileSync(testFile, JSON.stringify({
            holidays: [
                { holiday_name: 'TEST_HOLIDAY_DUP', start_date: '2026-08-01', end_date: '2026-08-01' },
                { holiday_name: 'TEST_HOLIDAY_DUP', start_date: '2026-08-15', end_date: '2026-08-15' }
            ]
        }));

        const res = spawnSync('node', [
            SCRIPT_PATH,
            '--file', testFile,
            '--dry-run'
        ], {
            env: { ...process.env, DB_NAME, NODE_ENV: 'test' },
            encoding: 'utf8'
        });

        assert.equal(res.status, 1, 'Script phải từ chối với exit code 1');
        assert.ok(res.stderr.includes('Trùng lặp tên ngày lễ'), 'Phải có thông báo lỗi trùng lặp');
    });
});
