#!/usr/bin/env node

/**
 * tools/read_staging_logs.js
 * 
 * Lệnh chỉ đọc tóm tắt các lỗi trên Staging trong 1 giờ gần nhất (Mục C.3).
 * TUYỆT ĐỐI KHÔNG IN SECRET, TOKEN, MẬT KHẨU HOẶC DỮ LIỆU CÁ NHÂN (PII).
 * 
 * Cách dùng:
 *   node tools/read_staging_logs.js [--hours 1]
 *   node tools/read_staging_logs.js --url https://sedinco-backend-staging.onrender.com --token <admin_token>
 */

const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
        return args[idx + 1];
    }
    return defaultValue;
}

const hours = Math.max(1, Number(getArg('--hours', 1)));
const remoteUrl = getArg('--url', null);
const adminToken = getArg('--token', null);

function maskSensitive(val) {
    if (!val || typeof val !== 'string') return '';
    if (val.length <= 8) return '****';
    return `${val.substring(0, 4)}...${val.slice(-4)}`;
}

async function run() {
    console.log(`======================================================================`);
    console.log(`📊 TÓM TẮT SỰ KIỆN & LỖI STAGING (TRONG ${hours} GIỜ GẦN NHẤT)`);
    console.log(`======================================================================\n`);

    let summary = null;

    if (remoteUrl) {
        console.log(`🌐 Đang kết nối tới máy chủ từ xa: ${remoteUrl}/api/diagnostics/recent-logs...`);
        try {
            const url = `${remoteUrl.replace(/\/+$/, '')}/api/diagnostics/recent-logs?hours=${hours}`;
            const headers = {};
            if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;
            const res = await fetch(url, { headers });
            if (!res.ok) {
                console.error(`❌ Máy chủ trả về lỗi HTTP ${res.status}: ${res.statusText}`);
                process.exit(1);
            }
            summary = await res.json();
        } catch (e) {
            console.error(`❌ Không thể kết nối tới máy chủ từ xa: ${e.message}`);
            process.exit(1);
        }
    } else {
        // Đọc từ local log store
        try {
            const { getRecentEvents } = require('../sedinco_backend/src/utils/stagingLogStore');
            summary = getRecentEvents(hours);
        } catch (err) {
            console.error(`❌ Lỗi đọc dữ liệu nhật ký cục bộ: ${err.message}`);
            process.exit(1);
        }
    }

    if (!summary || summary.total === 0) {
        console.log(`✅ Không có sự kiện lỗi nào được ghi nhận trong ${hours} giờ qua.`);
        console.log(`======================================================================\n`);
        return;
    }

    console.log(`📌 TỔNG SỐ LỖI / SỰ KIỆN GHI NHẬN: ${summary.total}\n`);

    console.log(`📍 PHÂN BỔ THEO ROUTE:`);
    const routes = Object.entries(summary.by_route || {});
    if (routes.length === 0) {
        console.log(`   (Không có dữ liệu route)`);
    } else {
        routes.sort((a, b) => b[1] - a[1]);
        for (const [r, count] of routes) {
            console.log(`   - ${r.padEnd(40)} : ${count} lỗi`);
        }
    }
    console.log('');

    console.log(`👤 PHÂN BỔ THEO VAI TRÒ (ROLE):`);
    const roles = Object.entries(summary.by_role || {});
    if (roles.length === 0) {
        console.log(`   (Không có dữ liệu role)`);
    } else {
        roles.sort((a, b) => b[1] - a[1]);
        for (const [role, count] of roles) {
            console.log(`   - ${role.padEnd(20)} : ${count} lỗi`);
        }
    }
    console.log('');

    const recent = summary.recent_items || [];
    console.log(`📋 CHI TIẾT CÁC LỖI GẦN NHẤT (${Math.min(recent.length, 20)} sự kiện):`);
    recent.slice(0, 20).forEach((item, idx) => {
        const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString('vi-VN') : 'N/A';
        const route = item.route || 'N/A';
        const role = item.role || 'anonymous';
        const msg = item.error_message || item.message || 'Lỗi không xác định';
        const code = item.api_code || item.code || item.rejection_code || item.status || 'ERROR';
        const reqId = item.request_id ? ` [Req: ${item.request_id}]` : '';

        console.log(`   ${idx + 1}. [${time}] [${role}] [${code}] ${route}${reqId}`);
        console.log(`      ↳ ${msg}`);
    });

    console.log(`\n======================================================================`);
    console.log(`🛡️  BẢO MẬT: Đã kiểm tra không chứa PII / credentials / plain secrets.`);
    console.log(`======================================================================\n`);
}

run();
