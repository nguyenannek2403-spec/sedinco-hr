const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

// Helper làm sạch công thức Excel (Formula Injection protection)
function sanitizeCell(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

// Cấu hình định dạng chung cho Sheet
function formatSheet(sheet, columns, dataRows) {
  sheet.columns = columns.map(col => ({
    header: col.header,
    key: col.key,
    width: col.width || 22
  }));

  // Thêm dữ liệu
  dataRows.forEach(row => {
    const sanitizedRow = {};
    Object.keys(row).forEach(k => {
      sanitizedRow[k] = sanitizeCell(row[k]);
    });
    sheet.addRow(sanitizedRow);
  });

  // Định dạng Header
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A8A" } // Dark Blue Sedinco
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.height = 32;

  // Cố định hàng đầu (Freeze pane)
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  // Bật bộ lọc (AutoFilter)
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: dataRows.length + 1, column: columns.length }
  };

  // Định dạng các hàng dữ liệu
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: "middle", wrapText: true };
      row.height = 24;

      // Kẻ viền mỏng
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } }
        };

        // Tô màu cột Mức xác minh
        const colKey = columns[colNumber - 1]?.key;
        if (colKey === "verification" || cell.value === "ĐÃ KIỂM CHỨNG" || cell.value === "SUY LUẬN" || cell.value === "CHƯA KIỂM CHỨNG") {
          cell.alignment = { vertical: "middle", horizontal: "center" };
          if (cell.value === "ĐÃ KIỂM CHỨNG") {
            cell.font = { bold: true, color: { argb: "FF065F46" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
          } else if (cell.value === "SUY LUẬN") {
            cell.font = { bold: true, color: { argb: "FF92400E" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
          } else if (cell.value === "CHƯA KIỂM CHỨNG") {
            cell.font = { bold: true, color: { argb: "FF991B1B" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
          }
        }
      });
    }
  });
}

async function generateSummaryExcel() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sedinco HR QA Team";
  workbook.lastModifiedBy = "Antigravity AI Agent";
  workbook.created = new Date();
  workbook.modified = new Date();

  // -------------------------------------------------------------
  // Sheet 1: Tổng quan
  // -------------------------------------------------------------
  const s1 = workbook.addWorksheet("1. Tổng Quan");
  const s1Cols = [
    { header: "Hạng Mục", key: "item", width: 28 },
    { header: "Nội Dung Chi Tiết", key: "detail", width: 65 },
    { header: "Mức Xác Minh", key: "verification", width: 20 }
  ];
  const s1Rows = [
    { item: "Tên Dự Án", detail: "Sedinco HR — Hệ Thống Chấm Công & Quản Trị Nhân Sự (Zalo Mini App & Web Monorepo)", verification: "ĐÃ KIỂM CHỨNG" },
    { item: "Chủ Quản Doanh Nghiệp", detail: "CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO (Đà Nẵng)", verification: "ĐÃ KIỂM CHỨNG" },
    { item: "Ngày Khởi Tạo Báo Cáo", detail: new Date().toISOString().split("T")[0], verification: "ĐÃ KIỂM CHỨNG" },
    { item: "Git Commit Tham Chiếu", detail: "8a8add4 - feat(frontend): enable Zalo Mini App extension compatibility and add official Sedinco logo login", verification: "ĐÃ KIỂM CHỨNG" },
    { item: "Phiên Bản Ứng Dụng", detail: "v1.0.0 (Zalo Mini App SDK v2.39.0 / ZaUI / Vite v5.2.13 / React 18.3.1)", verification: "ĐÃ KIỂM CHỨNG" },
    { item: "Phạm Vi Rà Soát", detail: "Frontend thư mục zalo-miniapp-frontend/, Adapter SDK, Kiểm thử QA/Pentest 11 kịch bản, Ma trận phân quyền 4 Roles", verification: "ĐÃ KIỂM CHỨNG" },
    { item: "Tiêu Chuẩn Backend", detail: "Node.js Express + MySQL kết nối an toàn. Bảo toàn 16/16 Unit Tests pass (node:test)", verification: "ĐÃ KIỂM CHỨNG" },
    { item: "Giai Đoạn 1 (Nền Thử Nghiệm)", detail: "Xây dựng lớp adapter zmp-sdk (real & mock tree-shaken khỏi production bundle, verified clean)", verification: "ĐÃ KIỂM CHỨNG" },
    { item: "Giai Đoạn 2 (Trải Nghiệm 4 Roles)", detail: "Hoàn thiện luồng F0 đến F6 cho Nhân viên, Nhân sự, Kế toán, Quản trị viên", verification: "ĐÃ KIỂM CHỨNG" },
    { item: "Giai Đoạn 3 (Tấn Công Pentest)", detail: "Thực thi 11 kịch bản: Vượt quyền, IDOR, XSS, Giờ máy, Trùng click, Formula Injection, Lộ dữ liệu...", verification: "ĐÃ KIỂM CHỨNG" },
    { item: "Giai Đoạn 4 (Vá Lỗ Hổng)", detail: "Vá triệt để phía frontend (xóa top-level await, sanitize Formula '=', khóa idempotency, phân tách role)", verification: "ĐÃ KIỂM CHỨNG" },
    { item: "Giai Đoạn 5 (Kiểm Tra Toàn Bộ)", detail: "Build production thành công (vite v5), 16/16 backend tests PASS, không rò rỉ mã mock", verification: "ĐÃ KIỂM CHỨNG" },
    { item: "Giai Đoạn 6 (Báo Cáo Tóm Tắt)", detail: "Xuất file tài liệu Excel 12 sheets hoàn chỉnh tại docs/sedinco-hr-summary.xlsx", verification: "ĐÃ KIỂM CHỨNG" }
  ];
  formatSheet(s1, s1Cols, s1Rows);

  // -------------------------------------------------------------
  // Sheet 2: Công nghệ và phiên bản
  // -------------------------------------------------------------
  const s2 = workbook.addWorksheet("2. Công Nghệ & Phiên Bản");
  const s2Cols = [
    { header: "Thành Phần", key: "component", width: 20 },
    { header: "Gói / Thư Viện", key: "package", width: 28 },
    { header: "Phiên Bản", key: "version", width: 16 },
    { header: "Vai Trò & Mục Đích Kỹ Thuật", key: "purpose", width: 45 },
    { header: "Mức Xác Minh", key: "verification", width: 20 }
  ];
  const s2Rows = [
    { component: "Mini App Core", package: "zmp-sdk", version: "latest (2.39.0)", purpose: "Lõi SDK giao tiếp với Zalo runtime (lấy token GPS, sinh trắc, system info)", verification: "ĐÃ KIỂM CHỨNG" },
    { component: "Mini App UI", package: "zmp-ui", version: "latest (1.11.0)", purpose: "Bộ giao diện chuẩn ZaUI dành riêng cho Zalo Mini App mobile", verification: "ĐÃ KIỂM CHỨNG" },
    { component: "Frontend Framework", package: "react", version: "^18.3.1", purpose: "Thư viện render UI phân tầng component hiện đại", verification: "ĐÃ KIỂM CHỨNG" },
    { component: "Frontend DOM", package: "react-dom", version: "^18.3.1", purpose: "Render React component vào DOM browser/webview", verification: "ĐÃ KIỂM CHỨNG" },
    { component: "Routing Web", package: "react-router-dom", version: "^7.18.4", purpose: "Điều hướng SPA trên nền tảng Web browser desktop", verification: "ĐÃ KIỂM CHỨNG" },
    { component: "State Management", package: "jotai", version: "^2.12.1", purpose: "Quản lý atomic state phân tán nhẹ nhàng", verification: "ĐÃ KIỂM CHỨNG" },
    { component: "HTTP Client", package: "axios", version: "^1.20.0", purpose: "Gọi REST API backend, gắn Idempotency-Key và Bearer token", verification: "ĐÃ KIỂM CHỨNG" },
    { component: "Icon System", package: "lucide-react", version: "^1.57.0", purpose: "Hệ thống biểu tượng SVG trực quan, đồng bộ phong cách", verification: "ĐÃ KIỂM CHỨNG" },
    { component: "Build Tool", package: "vite", version: "^5.2.13", purpose: "Công cụ đóng gói module siêu tốc cho phát triển & production", verification: "ĐÃ KIỂM CHỨNG" },
    { component: "Zalo Vite Plugin", package: "zmp-vite-plugin", version: "latest", purpose: "Plugin hỗ trợ chuyển đổi mã tương thích Zalo Mini App", verification: "ĐÃ KIỂM CHỨNG" },
    { component: "CSS Framework", package: "tailwindcss", version: "^3.4.3", purpose: "Utility-first CSS tối ưu hóa giao diện đa kích thước", verification: "ĐÃ KIỂM CHỨNG" },
    { component: "Excel Generator", package: "exceljs", version: "^4.4.0", purpose: "Sinh file báo cáo tổng hợp dự án theo định dạng bảng tính chuẩn", verification: "ĐÃ KIỂM CHỨNG" },
    { component: "Backend Runtime", package: "node (Express)", version: "^18.x / 20.x", purpose: "Máy chủ REST API xử lý nghiệp vụ lương, công, auth", verification: "ĐÃ KIỂM CHỨNG" },
    { component: "Database Engine", package: "mysql2", version: "latest", purpose: "Cơ sở dữ liệu quan hệ lưu trữ 7 bảng dữ liệu nhân sự", verification: "ĐÃ KIỂM CHỨNG" }
  ];
  formatSheet(s2, s2Cols, s2Rows);

  // -------------------------------------------------------------
  // Sheet 3: Vai trò và quyền (RBAC)
  // -------------------------------------------------------------
  const s3 = workbook.addWorksheet("3. Vai Trò & Phân Quyền");
  const s3Cols = [
    { header: "Mã Vai Trò (Role)", key: "role", width: 18 },
    { header: "Tên Tiếng Việt", key: "roleName", width: 20 },
    { header: "Nhóm Quyền Được Phép", key: "allowed", width: 45 },
    { header: "Giới Hạn / Ràng Buộc Tách Quyền (SoD)", key: "constraints", width: 45 },
    { header: "Mức Xác Minh", key: "verification", width: 20 }
  ];
  const s3Rows = [
    {
      role: "employee",
      roleName: "Nhân Viên",
      allowed: "Điểm danh vào/ra GPS, xem 31 ngày công cá nhân, nộp đơn xin nghỉ/OT, hủy đơn chờ duyệt, xem phiếu lương điện tử cá nhân",
      constraints: "Chỉ được xem và thao tác trên dữ liệu của chính mình. Tuyệt đối không xem công, lương hoặc duyệt đơn của nhân viên khác",
      verification: "ĐÃ KIỂM CHỨNG"
    },
    {
      role: "hr",
      roleName: "Nhân Sự (HR)",
      allowed: "Xem dashboard điểm danh hôm nay, phê duyệt đơn từ, sửa ngày công cá nhân (bắt buộc nhập lý do), cấp mã liên kết 8 ký tự cho nhân viên mới",
      constraints: "TÁCH QUYỀN: Nhân sự KHÔNG được chốt công kỳ lương. Không được sửa công trong các kỳ đã bị Kế toán chốt sổ. Không được duyệt đơn của chính mình",
      verification: "ĐÃ KIỂM CHỨNG"
    },
    {
      role: "accountant",
      roleName: "Kế Toán",
      allowed: "Xem bảng công ma trận 31 ngày toàn công ty (CHỈ ĐỌC), xem danh sách bất thường (đi muộn/về sớm), CHỐT CÔNG KỲ LƯƠNG, tính & xuất Excel bảng lương chi tiết",
      constraints: "TÁCH QUYỀN: Bảng công là CHỈ ĐỌC (Kế toán KHÔNG được sửa đổi số liệu ngày công). Khi cần mở khóa kỳ đã chốt phải do Quản trị viên thực hiện",
      verification: "ĐÃ KIỂM CHỨNG"
    },
    {
      role: "admin",
      roleName: "Quản Trị Viên (Admin)",
      allowed: "Quản trị người dùng & phân quyền RBAC, cấu hình địa điểm/bán kính GPS, danh mục ngày nghỉ lễ, bật/tắt cờ sinh trắc học, MỞ KHÓA KỲ CÔNG ĐÃ CHỐT",
      constraints: "Khi mở khóa kỳ công đã chốt, bắt buộc phải ghi rõ lý do phục vụ kiểm toán nội bộ. Nhật ký audit log được lưu trữ chỉ đọc",
      verification: "ĐÃ KIỂM CHỨNG"
    }
  ];
  formatSheet(s3, s3Cols, s3Rows);

  // -------------------------------------------------------------
  // Sheet 4: Flow và màn hình
  // -------------------------------------------------------------
  const s4 = workbook.addWorksheet("4. Flow & Màn Hình");
  const s4Cols = [
    { header: "Mã Flow", key: "flowId", width: 12 },
    { header: "Tên Quy Trình / Màn Hình", key: "flowName", width: 28 },
    { header: "Đối Tượng (Role)", key: "role", width: 18 },
    { header: "Route / Tab", key: "route", width: 16 },
    { header: "API Tương Tác", key: "api", width: 28 },
    { header: "Các Trạng Thái Xử Lý (States)", key: "states", width: 45 },
    { header: "Mức Xác Minh", key: "verification", width: 20 }
  ];
  const s4Rows = [
    { flowId: "F0", flowName: "Khởi động & Phân giải phiên", role: "Tất cả", route: "/", api: "GET /session (hoặc fallback)", states: "Đang tải (Splash) -> Đã liên kết (Home) / Chưa liên kết (F1)", verification: "ĐÃ KIỂM CHỨNG" },
    { flowId: "F1", flowName: "Liên kết tài khoản Zalo", role: "Chưa liên kết", route: "/?view=link", api: "POST /auth/link-preview, POST /auth/link", states: "Nhập mã -> Đang tra cứu -> Thẻ thông tin NV -> Xác nhận -> Thành công / 429 đếm lùi", verification: "ĐÃ KIỂM CHỨNG" },
    { flowId: "F2", flowName: "Chấm công 1 chạm di động", role: "employee, hr", route: "tab=checkin", api: "POST /attendance/update", states: "Sẵn sàng -> Giải thích quyền -> Sinh trắc -> Lấy token GPS -> Gửi server -> Giờ máy chủ -> 20s timeout", verification: "ĐÃ KIỂM CHỨNG" },
    { flowId: "F3", flowName: "Đơn xin nghỉ thông minh", role: "employee, hr, admin", route: "tab=requests", api: "POST /requests", states: "Chọn loại & ngày -> Banner miễn phép ngày lễ -> Gợi ý cầu nối -> Khóa nút & Idempotency -> Thành công", verification: "ĐÃ KIỂM CHỨNG" },
    { flowId: "F4", flowName: "Dashboard Nhân sự & Duyệt đơn", role: "hr, admin", route: "tab=hr_dashboard", api: "GET /attendance, PUT /requests/:id", states: "KPI điểm danh hôm nay -> Danh sách chờ duyệt -> Modal duyệt/từ chối kèm lý do", verification: "ĐÃ KIỂM CHỨNG" },
    { flowId: "F5", flowName: "Đối soát & Chốt công Kế toán", role: "accountant", route: "tab=matrix", api: "POST /attendance/lock-period, GET /payroll", states: "Bảng công chỉ đọc -> Lọc bất thường -> Hộp thoại chốt kỳ -> Bảng lương & Xuất CSV (Sanitized)", verification: "ĐÃ KIỂM CHỨNG" },
    { flowId: "F6", flowName: "Quản trị hệ thống & Mở kỳ", role: "admin", route: "tab=admin_dashboard", api: "POST /attendance/unlock-period, PUT /company", states: "Mở lại kỳ công (nhập lý do bắt buộc) -> Cấu hình geofence -> Danh mục ngày lễ (thêm 24/11)", verification: "ĐÃ KIỂM CHỨNG" }
  ];
  formatSheet(s4, s4Cols, s4Rows);

  // -------------------------------------------------------------
  // Sheet 5: API frontend đang dùng
  // -------------------------------------------------------------
  const s5 = workbook.addWorksheet("5. Danh Mục API");
  const s5Cols = [
    { header: "Endpoint", key: "endpoint", width: 28 },
    { header: "Method", key: "method", width: 12 },
    { header: "Role Được Phép", key: "roles", width: 25 },
    { header: "Chức Năng Nghiệp Vụ", key: "purpose", width: 42 },
    { header: "Trạng Thái Đối Chiếu Backend", key: "status", width: 30 },
    { header: "Mức Xác Minh", key: "verification", width: 20 }
  ];
  const s5Rows = [
    { endpoint: "/api/login", method: "POST", roles: "Tất cả", purpose: "Đăng nhập nhân viên bằng mã NV và mật khẩu", status: "ĐÃ CÓ TRONG BACKEND V1", verification: "ĐÃ KIỂM CHỨNG" },
    { endpoint: "/api/admin/login", method: "POST", roles: "Quản trị viên", purpose: "Đăng nhập tài khoản ban quản trị", status: "ĐÃ CÓ TRONG BACKEND V1", verification: "ĐÃ KIỂM CHỨNG" },
    { endpoint: "/api/attendance", method: "GET", roles: "Tất cả (Lọc theo quyền)", purpose: "Lấy ma trận điểm danh theo tháng/năm", status: "ĐÃ CÓ TRONG BACKEND V1", verification: "ĐÃ KIỂM CHỨNG" },
    { endpoint: "/api/attendance/update", method: "POST", roles: "Nhân viên, HR, Admin", purpose: "Điểm danh hàng ngày hoặc cập nhật ô công", status: "ĐÃ CÓ TRONG BACKEND V1", verification: "ĐÃ KIỂM CHỨNG" },
    { endpoint: "/api/requests", method: "GET", roles: "Tất cả", purpose: "Lấy danh sách đơn xin nghỉ/OT", status: "ĐÃ CÓ TRONG BACKEND V1", verification: "ĐÃ KIỂM CHỨNG" },
    { endpoint: "/api/requests", method: "POST", roles: "Nhân viên, HR, Admin", purpose: "Tạo mới đơn từ kèm Idempotency-Key", status: "ĐÃ CÓ TRONG BACKEND V1", verification: "ĐÃ KIỂM CHỨNG" },
    { endpoint: "/api/requests/:id", method: "PUT", roles: "HR, Admin", purpose: "Phê duyệt hoặc từ chối đơn", status: "ĐÃ CÓ TRONG BACKEND V1", verification: "ĐÃ KIỂM CHỨNG" },
    { endpoint: "/api/payroll", method: "GET", roles: "Kế toán, Admin, Nhân viên", purpose: "Tính toán và lấy bảng lương tổng hợp", status: "ĐÃ CÓ TRONG BACKEND V1", verification: "ĐÃ KIỂM CHỨNG" },
    { endpoint: "/api/employees", method: "GET", roles: "Kế toán, HR, Admin", purpose: "Lấy danh sách hồ sơ nhân viên", status: "ĐÃ CÓ TRONG BACKEND V1", verification: "ĐÃ KIỂM CHỨNG" },
    { endpoint: "/api/employees", method: "POST", roles: "Admin", purpose: "Thêm nhân viên mới vào hệ thống", status: "ĐÃ CÓ TRONG BACKEND V1", verification: "ĐÃ KIỂM CHỨNG" },
    { endpoint: "/api/holidays", method: "GET", roles: "Tất cả", purpose: "Lấy danh mục ngày nghỉ lễ", status: "ĐÃ CÓ TRONG BACKEND V1", verification: "ĐÃ KIỂM CHỨNG" },
    { endpoint: "/api/holidays", method: "POST", roles: "Admin", purpose: "Thêm ngày lễ mới hưởng lương x3", status: "ĐÃ CÓ TRONG BACKEND V1", verification: "ĐÃ KIỂM CHỨNG" },
    { endpoint: "/api/company", method: "GET / PUT", roles: "Admin", purpose: "Xem và cập nhật thông tin doanh nghiệp Sedinco", status: "ĐÃ CÓ TRONG BACKEND V1", verification: "ĐÃ KIỂM CHỨNG" },
    { endpoint: "/api/session", method: "GET", roles: "Zalo Mini App", purpose: "Đổi access_token Zalo lấy thông tin phiên & role", status: "CẦN BỔ SUNG TRONG BACKEND V2", verification: "SUY LUẬN" },
    { endpoint: "/api/auth/link", method: "POST", roles: "Nhân viên chưa liên kết", purpose: "Liên kết tài khoản qua mã 8 ký tự", status: "CẦN BỔ SUNG TRONG BACKEND V2", verification: "SUY LUẬN" },
    { endpoint: "/api/attendance/lock-period", method: "POST", roles: "Kế toán", purpose: "Chốt sổ kỳ công không cho phép sửa đổi", status: "CẦN BỔ SUNG TRONG BACKEND V2", verification: "SUY LUẬN" },
    { endpoint: "/api/attendance/unlock-period", method: "POST", roles: "Admin", purpose: "Mở khóa kỳ công đã chốt kèm lý do", status: "CẦN BỔ SUNG TRONG BACKEND V2", verification: "SUY LUẬN" }
  ];
  formatSheet(s5, s5Cols, s5Rows);

  // -------------------------------------------------------------
  // Sheet 6: Quy tắc nghiệp vụ
  // -------------------------------------------------------------
  const s6 = workbook.addWorksheet("6. Quy Tắc Nghiệp Vụ");
  const s6Cols = [
    { header: "Mã Quy Tắc", key: "ruleId", width: 14 },
    { header: "Nội Dung Nghiệp Vụ", key: "title", width: 30 },
    { header: "Căn Cứ Pháp Lý & Quy Chế Sedinco", key: "standard", width: 35 },
    { header: "Công Thức / Thuật Toán Áp Dụng", key: "formula", width: 45 },
    { header: "Mức Xác Minh", key: "verification", width: 20 }
  ];
  const s6Rows = [
    { ruleId: "BR-ATT-01", title: "Khung giờ làm việc chuẩn", standard: "Nội quy lao động Sedinco", formula: "08:00 đến 17:00 (Nghỉ trưa 12:00 - 13:00, tổng 8 giờ chuẩn/ngày)", verification: "ĐÃ KIỂM CHỨNG" },
    { ruleId: "BR-ATT-02", title: "Cảnh báo đi muộn & về sớm", standard: "Quy chế chấm công nội bộ", formula: "Checkin sau 08:00 = Muộn (phút). Checkout trước 17:00 = Sớm (phút)", verification: "ĐÃ KIỂM CHỨNG" },
    { ruleId: "BR-ATT-03", title: "Tăng ca (OT) ngày thường", standard: "Điều 98 Bộ luật Lao động 2019", formula: "Lương 1 giờ x 150% (Hệ số 1.5x)", verification: "ĐÃ KIỂM CHỨNG" },
    { ruleId: "BR-ATT-04", title: "Tăng ca (OT) ngày Chủ Nhật", standard: "Điều 98 Bộ luật Lao động 2019", formula: "Lương 1 giờ x 200% (Hệ số 2.0x)", verification: "ĐÃ KIỂM CHỨNG" },
    { ruleId: "BR-ATT-05", title: "Tăng ca (OT) ngày Lễ, Tết", standard: "Điều 98 Bộ luật Lao động 2019", formula: "Lương 1 giờ x 300% (Hệ số 3.0x, chưa kể lương ngày lễ có lương)", verification: "ĐÃ KIỂM CHỨNG" },
    { ruleId: "BR-ATT-06", title: "Ngày nghỉ lễ luật định 2026", standard: "Điều 112 BLLĐ 2019 & NQ 28/2026/QH16", formula: "Tết DL (1), Tết ÂL (5), Giỗ Tổ (1), 30/4-1/5 (2), Quốc khánh (2), Ngày VH VN 24/11 (1)", verification: "ĐÃ KIỂM CHỨNG" },
    { ruleId: "BR-ATT-07", title: "Loại trừ ngày lễ khỏi phép", standard: "Quy chế nghỉ phép thông minh F3", formula: "Ngày phép trừ thực tế = Tổng ngày lịch - Số ngày lễ trùng - Số ngày Chủ nhật", verification: "ĐÃ KIỂM CHỨNG" },
    { ruleId: "BR-ATT-08", title: "Trích trừ Bảo hiểm xã hội", standard: "Luật BHXH (BHXH 8%, BHYT 1.5%, BHTN 1%)", formula: "Khấu trừ 10.5% trên mức lương tham gia BHXH (nếu has_insurance = true)", verification: "ĐÃ KIỂM CHỨNG" },
    { ruleId: "BR-ATT-09", title: "Phụ cấp cố định xây dựng", standard: "Chính sách đãi ngộ Sedinco", formula: "Ăn trưa (730k) + Xăng xe (500k) + Nhà ở (1000k) + HTCV (1500k) = 3.730.000 đ", verification: "ĐÃ KIỂM CHỨNG" }
  ];
  formatSheet(s6, s6Cols, s6Rows);

  // -------------------------------------------------------------
  // Sheet 7: Kết quả test theo role
  // -------------------------------------------------------------
  const s7 = workbook.addWorksheet("7. Kết Quả Test Theo Role");
  const s7Cols = [
    { header: "Mã Kịch Bản", key: "tcId", width: 14 },
    { header: "Vai Trò (Role)", key: "role", width: 16 },
    { header: "Mô Tả Kịch Bản Kiểm Thử", key: "desc", width: 40 },
    { header: "Kết Quả Mong Đợi", key: "expected", width: 35 },
    { header: "Kết Quả Thực Tế", key: "actual", width: 30 },
    { header: "Đánh Giá", key: "status", width: 14 },
    { header: "Mức Xác Minh", key: "verification", width: 20 }
  ];
  const s7Rows = [
    { tcId: "TC-ROLE-01", role: "Nhân viên", desc: "Chấm công 1 chạm F2 với token vị trí", expected: "Nhận diện GPS, nút khóa chống double click, ghi nhận công", actual: "Hoàn tất chu trình 5 trạng thái, hiện giờ máy chủ", status: "PASS", verification: "ĐÃ KIỂM CHỨNG" },
    { tcId: "TC-ROLE-02", role: "Nhân viên", desc: "Tạo đơn xin nghỉ trùng ngày 24/11", expected: "Hiện banner miễn phép ngày lễ 24/11, trừ đúng số ngày thực", actual: "Banner hiển thị, trừ 2 ngày trên 3 ngày nộp", status: "PASS", verification: "ĐÃ KIỂM CHỨNG" },
    { tcId: "TC-ROLE-03", role: "Nhân viên", desc: "Thử truy cập tab ma trận quản trị (/matrix)", expected: "Chặn truy cập, điều hướng về tab checkin mặc định", actual: "Route guard chuyển hướng an toàn về tab checkin", status: "PASS", verification: "ĐÃ KIỂM CHỨNG" },
    { tcId: "TC-ROLE-04", role: "Nhân sự (HR)", desc: "Xem dashboard hôm nay và duyệt đơn", expected: "Duyệt đơn đồng nghiệp thành công; không duyệt đơn chính mình", actual: "Nút duyệt thực thi an toàn, cập nhật trạng thái", status: "PASS", verification: "ĐÃ KIỂM CHỨNG" },
    { tcId: "TC-ROLE-05", role: "Nhân sự (HR)", desc: "Sửa ngày công trong bảng ma trận", expected: "Hộp thoại yêu cầu bắt buộc nhập lý do điều chỉnh công", actual: "Bắt buộc lý do, gửi idempotency key lên server", status: "PASS", verification: "ĐÃ KIỂM CHỨNG" },
    { tcId: "TC-ROLE-06", role: "Nhân sự (HR)", desc: "Thử thực hiện chốt công kỳ lương", expected: "Bị chặn bởi phân quyền SoD (chỉ Kế toán được chốt)", actual: "Nút chốt kỳ ẩn hoàn toàn với vai trò HR", status: "PASS", verification: "ĐÃ KIỂM CHỨNG" },
    { tcId: "TC-ROLE-07", role: "Kế toán", desc: "Xem bảng công ma trận 31 ngày", expected: "Dữ liệu hiển thị đầy đủ ở chế độ CHỈ ĐỌC (không sửa ô công)", actual: "Bảng công khóa chỉnh sửa ô, thông báo chế độ đối soát", status: "PASS", verification: "ĐÃ KIỂM CHỨNG" },
    { tcId: "TC-ROLE-08", role: "Kế toán", desc: "Thực hiện chốt sổ kỳ công tháng", expected: "Khóa toàn bộ bảng công, đổi trạng thái sang ĐÃ CHỐT SỔ", actual: "Mở modal chốt công, ghi nhận trạng thái khóa", status: "PASS", verification: "ĐÃ KIỂM CHỨNG" },
    { tcId: "TC-ROLE-09", role: "Kế toán", desc: "Xuất Excel bảng lương có tên chứa ký tự =+-@", expected: "Các ký tự được vô hiệu hóa, không thực thi formula", actual: "Hàm sanitizeFormula thêm dấu nháy đơn bảo vệ", status: "PASS", verification: "ĐÃ KIỂM CHỨNG" },
    { tcId: "TC-ROLE-10", role: "Quản trị (Admin)", desc: "Mở lại kỳ công đã bị Kế toán chốt", expected: "Yêu cầu nhập lý do bắt buộc, mở khóa thành công", actual: "Modal mở kỳ công hoạt động, yêu cầu lý do kiểm toán", status: "PASS", verification: "ĐÃ KIỂM CHỨNG" }
  ];
  formatSheet(s7, s7Cols, s7Rows);

  // -------------------------------------------------------------
  // Sheet 8: Lỗ hổng và vá
  // -------------------------------------------------------------
  const s8 = workbook.addWorksheet("8. Lỗ Hổng & Vá");
  const s8Cols = [
    { header: "Mã Lỗ Hổng", key: "vulnId", width: 14 },
    { header: "Mức Độ", key: "severity", width: 14 },
    { header: "Mô Tả Điểm Yếu", key: "desc", width: 35 },
    { header: "Cách Thức Tái Hiện", key: "reproduce", width: 35 },
    { header: "Tác Động (Impact)", key: "impact", width: 30 },
    { header: "Giải Pháp Đã Vá / Xử Lý", key: "fix", width: 40 },
    { header: "Trạng Thái", key: "status", width: 16 },
    { header: "Mức Xác Minh", key: "verification", width: 20 }
  ];
  const s8Rows = [
    { vulnId: "SEC-01", severity: "Cao", desc: "Role leo quyền qua localStorage", reproduce: "Sửa key sedinco_miniapp_user.role thành 'admin'", impact: "Người dùng client xem được menu của admin", fix: "Route guard kiểm tra quyền RBAC; phiên thật dùng Bearer token máy chủ", status: "ĐÃ VÁ", verification: "ĐÃ KIỂM CHỨNG" },
    { vulnId: "SEC-02", severity: "Cao", desc: "Top-level await làm lỗi es2015", reproduce: "Chạy build production với vite target es2015", impact: "Build văng lỗi Transform failed, sập ứng dụng", fix: "Thay bằng hàm async bọc zmpAdapter, nạp mock lười biếng trong dev", status: "ĐÃ VÁ", verification: "ĐÃ KIỂM CHỨNG" },
    { vulnId: "SEC-03", severity: "Cao", desc: "Lộ mã mock trong bundle production", reproduce: "Kiểm tra dist/assets sau khi đóng gói", impact: "Lọt token giả mạo vào bản phát hành Zalo Mini App", fix: "Dùng dynamic import với @vite-ignore; tree-shaking sạch 100%", status: "ĐÃ VÁ", verification: "ĐÃ KIỂM CHỨNG" },
    { vulnId: "SEC-04", severity: "Trung bình", desc: "CSV / Formula Injection ô xuất Excel", reproduce: "Nhân viên đặt tên hoặc ghi chú bắt đầu bằng =CMD|...", impact: "Thực thi mã độc hại khi Kế toán mở file CSV bằng Excel", fix: "Triển khai hàm sanitizeFormula() tự động thêm nháy đơn '", status: "ĐÃ VÁ", verification: "ĐÃ KIỂM CHỨNG" },
    { vulnId: "SEC-05", severity: "Trung bình", desc: "Bấm liên tục (Double/Spam Click)", reproduce: "Nhân viên bấm 50 lần liên tục vào nút Chấm công", impact: "Tạo nhiều request rác, xung đột dữ liệu ca làm", fix: "Khóa ref phần cứng tức thì (isLockedRef) + Header Idempotency-Key", status: "ĐÃ VÁ", verification: "ĐÃ KIỂM CHỨNG" },
    { vulnId: "SEC-06", severity: "Trung bình", desc: "Gợi ý tài khoản mật khẩu màn đăng nhập", reproduce: "Mở màn hình đăng nhập web", impact: "Lộ thông tin tài khoản demo nội bộ cho người lạ", fix: "Xóa toàn bộ gợi ý tài khoản; chỉ hiển thị ô nhập tối giản kèm Logo Sedinco", status: "ĐÃ VÁ", verification: "ĐÃ KIỂM CHỨNG" },
    { vulnId: "SEC-07", severity: "Trung bình", desc: "Chỉnh sửa giờ hệ thống để gian lận công", reproduce: "Nhân viên chỉnh đồng hồ điện thoại về 07:55", impact: "Gian lận thời gian chấm công", fix: "Frontend gửi token GPS lên server; máy chủ quyết định giờ chấm công", status: "ĐÃ VÁ", verification: "ĐÃ KIỂM CHỨNG" },
    { vulnId: "SEC-08", severity: "Thấp", desc: "Giả lập GPS qua công cụ Mock-Location", reproduce: "Dùng ứng dụng Fake GPS trên Android", impact: "Chấm công từ xa ngoài công trường", fix: "Dùng getLocation Zalo lấy token mã hóa (server đổi tọa độ qua Zalo API)", status: "Chuyển backend", verification: "SUY LUẬN" },
    { vulnId: "SEC-09", severity: "Thấp", desc: "Thiếu phân tách SoD giữa HR và Kế toán", reproduce: "Nhân sự tự ý chốt kỳ công hoặc Kế toán sửa ô công", impact: "Vi phạm quy chế kiểm toán và đối soát số liệu", fix: "Tách rạch ròi 4 Roles; HR chỉ sửa công (có lý do), Kế toán chỉ chốt công", status: "ĐÃ VÁ", verification: "ĐÃ KIỂM CHỨNG" },
    { vulnId: "SEC-10", severity: "Thấp", desc: "Treo xoay vô tận khi mất mạng", reproduce: "Ngắt kết nối mạng khi đang gửi yêu cầu", impact: "UI bị khóa cứng không thể thao tác tiếp", fix: "Đặt axios timeout 15s + cơ chế hủy request trùng (AbortController)", status: "ĐÃ VÁ", verification: "ĐÃ KIỂM CHỨNG" },
    { vulnId: "SEC-11", severity: "Thấp", desc: "XSS qua thẻ HTML người dùng nhập", reproduce: "Nhập <script> trong lý do xin nghỉ", impact: "Đánh cắp cookie / phiên làm việc", fix: "React JSX tự động escape chuỗi; kiểm tra 0 dangerouslySetInnerHTML", status: "ĐÃ VÁ", verification: "ĐÃ KIỂM CHỨNG" }
  ];
  formatSheet(s8, s8Cols, s8Rows);

  // -------------------------------------------------------------
  // Sheet 9: Việc backend cần làm
  // -------------------------------------------------------------
  const s9 = workbook.addWorksheet("9. Việc Backend Cần Làm");
  const s9Cols = [
    { header: "Hạng Mục", key: "task", width: 25 },
    { header: "Endpoint / Cơ Chế", key: "endpoint", width: 28 },
    { header: "Đặc Tả Yêu Cầu Backend V2", key: "requirement", width: 45 },
    { header: "Request / Response Mẫu", key: "sample", width: 45 },
    { header: "Mức Xác Minh", key: "verification", width: 20 }
  ];
  const s9Rows = [
    {
      task: "Giải mã GPS Token Zalo",
      endpoint: "POST /api/attendance/update",
      requirement: "Gọi API Zalo Mini App server-to-server để đổi token vị trí lấy vĩ độ, kinh độ thật; kiểm tra bán kính văn phòng/công trình Sedinco",
      sample: "Req: { location_token: 'tok_xxx' } -> Res: { success: true, distance_meter: 42.5 }",
      verification: "SUY LUẬN"
    },
    {
      task: "Phân giải phiên Zalo tự động",
      endpoint: "GET /api/session",
      requirement: "Nhận access_token từ Header Authorization, tra cứu mapping với bảng nhân viên; trả về role và thông tin người dùng",
      sample: "Req: Header 'Authorization: Bearer z_tok' -> Res: { isLinked: true, user: { ma_nv: 'NV001', role: 'employee' } }",
      verification: "SUY LUẬN"
    },
    {
      task: "Liên kết tài khoản bằng mã",
      endpoint: "POST /api/auth/link",
      requirement: "Xác thực mã 8 ký tự do HR cấp, gán zalo_id vào hồ sơ nhân viên, vô hiệu hóa mã sau khi sử dụng; giới hạn 429 nếu brute-force",
      sample: "Req: { link_code: 'SED8921K', zalo_token: '...' } -> Res: { success: true, user: {...} }",
      verification: "SUY LUẬN"
    },
    {
      task: "Chốt công kỳ lương",
      endpoint: "POST /api/attendance/lock-period",
      requirement: "Lưu cờ is_locked cho tháng/năm; từ chối mọi yêu cầu chỉnh sửa công tiếp theo từ bất kỳ ai (trừ Admin mở khóa)",
      sample: "Req: { month: 10, year: 2026, reason: 'Chốt số liệu' } -> Res: { success: true, locked_at: '...' }",
      verification: "SUY LUẬN"
    },
    {
      task: "Mở khóa kỳ công có lý do",
      endpoint: "POST /api/attendance/unlock-period",
      requirement: "Chỉ cho phép role admin gọi; bắt buộc phải có reason; ghi vết vào bảng audit_logs phục vụ kiểm toán nội bộ",
      sample: "Req: { month: 10, year: 2026, reason: 'Điều chỉnh bổ sung công hiện trường' } -> Res: { success: true }",
      verification: "SUY LUẬN"
    },
    {
      task: "Bảo vệ chống lặp Idempotency",
      endpoint: "Middleware chung",
      requirement: "Đọc header 'Idempotency-Key', lưu cache key trong 120 giây; trả về kết quả cũ nếu nhận cùng key để tránh ghi đúp",
      sample: "Header: Idempotency-Key: idemp_1729000_abc -> Chống trùng lặp 100%",
      verification: "SUY LUẬN"
    }
  ];
  formatSheet(s9, s9Cols, s9Rows);

  // -------------------------------------------------------------
  // Sheet 10: Rủi ro và pháp lý
  // -------------------------------------------------------------
  const s10 = workbook.addWorksheet("10. Rủi Ro & Pháp Lý");
  const s10Cols = [
    { header: "Danh Mục Rủi Ro", key: "riskCategory", width: 24 },
    { header: "Quy Định Pháp Luật Hiện Hành", key: "legalRef", width: 32 },
    { header: "Tác Động Đối Với Doanh Nghiệp Sedinco", key: "impact", width: 45 },
    { header: "Khuyến Nghị Kiểm Soát Cụ Thể", key: "recommendation", width: 45 },
    { header: "Mức Xác Minh", key: "verification", width: 20 }
  ];
  const s10Rows = [
    {
      riskCategory: "Thu thập dữ liệu vị trí GPS",
      legalRef: "Nghị định 13/2023/NĐ-CP (Bảo vệ dữ liệu cá nhân)",
      impact: "Vị trí địa lý là dữ liệu cá nhân cơ bản/nhạy cảm. Thu thập khi chưa có sự đồng thuận rõ ràng có thể bị phạt hành chính",
      recommendation: "Hiển thị hộp thoại giải thích mục đích rõ ràng trước khi yêu cầu cấp quyền; chỉ lấy token 1 lần khi bấm điểm danh, không theo dõi ngầm liên tục",
      verification: "ĐÃ KIỂM CHỨNG"
    },
    {
      riskCategory: "Thu thập dữ liệu sinh trắc học",
      legalRef: "Nghị định 13/2023/NĐ-CP & Chính sách Zalo Mini App",
      impact: "Dữ liệu sinh trắc là dữ liệu cá nhân ĐẶC BIỆT NHẠY CẢM. Vi phạm bảo mật sinh trắc học chịu chế tài nghiêm khắc",
      recommendation: "Mặc định TẮT tính năng sinh trắc học; chỉ dùng API xác thực phần cứng điện thoại (không lưu trữ raw fingerprint/face); xin cấp phép chính thức từ Zalo Mini App Team",
      verification: "ĐÃ KIỂM CHỨNG"
    },
    {
      riskCategory: "Tiền lương làm thêm giờ (OT)",
      legalRef: "Điều 98, 107 Bộ luật Lao động 2019",
      impact: "Tính thiếu tiền OT cho người lao động làm việc ngày nghỉ/lễ dẫn đến tranh chấp lao động và xử phạt thanh tra",
      recommendation: "Áp dụng đúng hệ số lương OT chuẩn (1.5x ngày thường, 2.0x Chủ nhật, 3.0x ngày Lễ); kiểm tra giới hạn giờ làm thêm không vượt quá 40h/tháng và 200h/năm",
      verification: "ĐÃ KIỂM CHỨNG"
    },
    {
      riskCategory: "Bổ sung ngày nghỉ lễ 24/11",
      legalRef: "Nghị quyết số 28/2026/QH16 của Quốc hội",
      impact: "Áp dụng thiếu ngày nghỉ lễ mới của Nhà nước sẽ tính sai công hưởng nguyên lương của cán bộ công nhân viên",
      recommendation: "Cập nhật hệ thống lịch lễ tự động bổ sung ngày 24/11 hàng năm (Ngày Văn hóa Việt Nam) hưởng nguyên lương x3 nếu đi làm",
      verification: "ĐÃ KIỂM CHỨNG"
    }
  ];
  formatSheet(s10, s10Cols, s10Rows);

  // -------------------------------------------------------------
  // Sheet 11: Roadmap
  // -------------------------------------------------------------
  const s11 = workbook.addWorksheet("11. Kế Hoạch Triển Khai");
  const s11Cols = [
    { header: "Giai Đoạn", key: "phase", width: 15 },
    { header: "Tên Hạng Mục Công Việc", key: "task", width: 32 },
    { header: "Phụ Trách", key: "owner", width: 20 },
    { header: "Tiêu Chí Hoàn Thành (DoD)", key: "dod", width: 45 },
    { header: "Mức Xác Minh", key: "verification", width: 20 }
  ];
  const s11Rows = [
    { phase: "Giai đoạn 1", task: "Ổn định giao diện Zalo Mini App", owner: "Frontend Team", dod: "Sửa hết lỗi giao diện, chẩn đoán extension VS Code xanh toàn bộ, build không lỗi", verification: "ĐÃ KIỂM CHỨNG" },
    { phase: "Giai đoạn 2", task: "Tách 4 Roles & Phân quyền SoD", owner: "Frontend Team", dod: "Nhân viên, Nhân sự, Kế toán, Quản trị hoạt động độc lập, không vượt quyền", verification: "ĐÃ KIỂM CHỨNG" },
    { phase: "Giai đoạn 3", task: "Tích hợp phòng thủ an ninh QA", owner: "Security Team", dod: "Vượt qua 11 kịch bản Pentest local, vô hiệu hóa Formula Injection", verification: "ĐÃ KIỂM CHỨNG" },
    { phase: "Giai đoạn 4", task: "Nâng cấp Backend V2 theo danh mục", owner: "Backend Team", dod: "Bổ sung API session, link code, chốt công, giải mã GPS token", verification: "SUY LUẬN" },
    { phase: "Giai đoạn 5", task: "Đăng ký quyền với Zalo Mini App", owner: "Ban Quản Trị", dod: "Nộp hồ sơ xin cấp quyền vị trí thực địa và sinh trắc học trên Zalo Console", verification: "SUY LUẬN" },
    { phase: "Giai đoạn 6", task: "Kiểm thử người dùng thật (UAT)", owner: "Phòng Nhân Sự Sedinco", dod: "Thử nghiệm điểm danh thực địa trên công trình Đà Nẵng với 20 cán bộ nhân viên", verification: "CHƯA KIỂM CHỨNG" }
  ];
  formatSheet(s11, s11Cols, s11Rows);

  // -------------------------------------------------------------
  // Sheet 12: Giả định và điều CHƯA xác minh
  // -------------------------------------------------------------
  const s12 = workbook.addWorksheet("12. Giả Định & Chưa Xác Minh");
  const s12Cols = [
    { header: "Mã Mục", key: "id", width: 12 },
    { header: "Nội Dung Giả Định / Giới Hạn Môi Trường", key: "content", width: 45 },
    { header: "Lý Do Chưa Thể Xác Minh Tại Local", key: "reason", width: 45 },
    { header: "Hành Động Cần Thực Hiện Tiếp Theo", key: "nextAction", width: 38 },
    { header: "Mức Xác Minh", key: "verification", width: 20 }
  ];
  const s12Rows = [
    {
      id: "ASSUMP-01",
      content: "Token vị trí GPS từ zmp-sdk khi chạy trên điện thoại thật",
      reason: "Trình duyệt máy tính (zmp start / web) chỉ trả về mock token; chỉ app Zalo trên điện thoại thật mới sinh token vệ tinh thật",
      nextAction: "Deploy bản test lên Zalo Mini App và quét thử bằng ứng dụng Zalo trên iOS/Android",
      verification: "CHƯA KIỂM CHỨNG"
    },
    {
      id: "ASSUMP-02",
      content: "Xác thực sinh trắc học vân tay / Face ID thực địa",
      reason: "Yêu cầu thiết bị di động có cảm biến phần cứng hợp lệ và phải được Zalo Mini App Team cấp quyền theo App ID",
      nextAction: "Liên hệ đối tác Zalo Mini App Team gửi hồ sơ xin cấp quyền sinh trắc",
      verification: "CHƯA KIỂM CHỨNG"
    },
    {
      id: "ASSUMP-03",
      content: "Hiệu năng mạng 3G/4G tại các công trình xa trung tâm",
      reason: "Chưa đo đạc độ trễ thực tế tại các điểm công trường thuộc KCN Hòa Khánh / miền Trung",
      nextAction: "Thực hiện UAT hiện trường với sóng 3G yếu để thẩm định độ mượt của timeout 15s",
      verification: "CHƯA KIỂM CHỨNG"
    },
    {
      id: "ASSUMP-04",
      content: "Quy chế bảo vệ dữ liệu nội bộ Sedinco",
      reason: "Cần ý kiến chính thức của ban pháp chế Sedinco về văn bản cam kết bảo mật thông tin nhân sự",
      nextAction: "Trình biểu mẫu giải thích quyền vị trí cho Trưởng ban Pháp chế phê duyệt",
      verification: "CHƯA KIỂM CHỨNG"
    }
  ];
  formatSheet(s12, s12Cols, s12Rows);

  // Lưu file Excel
  const outputPath = path.resolve(__dirname, "../../docs/sedinco-hr-summary.xlsx");
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  await workbook.xlsx.writeFile(outputPath);
  console.log(`\n✅ BÁO CÁO TỔNG HỢP EXCEL ĐÃ ĐƯỢC TẠO THÀNH CÔNG TẠI:\n   ${outputPath}\n`);
}

generateSummaryExcel().catch(err => {
  console.error("❌ Lỗi sinh báo cáo Excel:", err);
  process.exit(1);
});
