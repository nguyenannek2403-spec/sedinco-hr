/**
 * tools/update_verification_excel.js
 * 
 * Cập nhật file reports/verification-2026-10-27.xlsx thêm 3 sheet:
 *  1. "Pilot"
 *  2. "Rủi ro còn lại"
 *  3. "Backlog chuyên nghiệp"
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const EXCEL_PATH = path.join(__dirname, '../reports/verification-2026-10-27.xlsx');

async function main() {
    console.log(`[EXCEL] Đang mở file: ${EXCEL_PATH} ...`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(EXCEL_PATH);

    // Xóa các sheet cũ nếu đã tồn tại để cập nhật mới
    const targetSheets = ['Pilot', 'Rủi ro còn lại', 'Backlog chuyên nghiệp'];
    for (const sheetName of targetSheets) {
        const existing = wb.getWorksheet(sheetName);
        if (existing) {
            wb.removeWorksheet(existing.id);
            console.log(`[EXCEL] Đã làm mới sheet: ${sheetName}`);
        }
    }

    // =========================================================================
    // SHEET 1: PILOT
    // =========================================================================
    console.log('[EXCEL] Đang tạo sheet "Pilot"...');
    const wsPilot = wb.addWorksheet('Pilot', { views: [{ showGridLines: true }] });

    // Tiêu đề lớn
    wsPilot.mergeCells('A1:I1');
    wsPilot.getCell('A1').value = 'SEDINCO HR - QUY TRÌNH & PHIẾU THỬ TAY ƯU TIÊN GIAI ĐOẠN PILOT (G7)';
    wsPilot.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    wsPilot.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    wsPilot.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
    wsPilot.getRow(1).height = 30;

    // Header bảng 1
    const pilotHeaders = [
        'STT', 'Mã Bước', 'Tên Bước Thử Nghiệm', 'Vai Trò',
        'Mô Tả Thao Tác & Dữ Liệu Đầu Vào', 'Kết Quả Kỳ Vọng Chuẩn',
        'Kết Quả Của Tôi', 'Ảnh Minh Chứng (Đường dẫn / Tên file)', 'Thông Báo Lỗi Nguyên Văn (Nếu có)'
    ];
    wsPilot.getRow(3).values = pilotHeaders;
    wsPilot.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    wsPilot.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    wsPilot.getRow(3).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    wsPilot.getRow(3).height = 25;

    const pilotSteps = [
        [
            1, 'PILOT-STEP-01', 'Đăng nhập lần đầu & Đổi mật khẩu bắt buộc', 'worker',
            'Đăng nhập tài khoản mới có cờ must_change_password=1 (ví dụ NV0004). Nhập mật khẩu cũ, thử mật khẩu mới trùng cũ, sau đó nhập mật khẩu hợp lệ (>=8 ký tự).',
            'Hệ thống hiện Modal bắt buộc đổi mật khẩu, chặn điều hướng khác. Từ chối khi trùng mật khẩu cũ. Đổi thành công: xóa cờ trong DB, vào Dashboard bình thường.',
            'CẦN NGƯỜI THỬ', 'reports/screens/L3_Run1_TC-L3-UI-FORCE-PWD-01_MODAL_375x812.png', ''
        ],
        [
            2, 'PILOT-STEP-02', 'Khởi chạy Kiosk Dynamic QR v2', 'admin',
            'Truy cập giao diện Kiosk Display trên máy tính bảng/PC tại cổng. Nhập Kiosk API Key được Admin cấp (ksk_*). Bật chế độ toàn màn hình.',
            'Kiosk kết nối thành công, hiển thị Dynamic QR v2 kèm bộ đếm ngược 30 giây. Mỗi 30s mã tự động đổi mới, không bị tắt màn hình.',
            'CẦN NGƯỜI THỬ', 'reports/screens/L3_Run1_TC-L3-UI-KIOSK-QR_BEFORE_414x896.png', ''
        ],
        [
            3, 'PILOT-STEP-03', 'Chấm công vào hợp lệ trong bán kính', 'worker',
            'Mở Zalo Mini App tại vị trí cổng nhà máy (đã bật GPS). Chọn Chấm công 1 chạm, hướng camera quét mã QR trên màn hình Kiosk.',
            'Hệ thống ghi nhận thành công: hiển thị thông báo Vào ca kèm giờ thực tế. Ghi nhận location_source="token" (hoặc "raw"), is_low_trust=0, lưu ảnh khuôn mặt.',
            'CẦN NGƯỜI THỬ', 'reports/screens/L3_Run1_TC-L3-UI-LOGIN-WORKER-01_375x812.png', ''
        ],
        [
            4, 'PILOT-STEP-04', 'Chấm công ra & Kiểm tra bảng công cá nhân', 'worker',
            'Thực hiện quét QR lần 2 lúc hết ca. Sau đó chuyển sang tab Lịch sử công / Bảng công cá nhân.',
            'Ghi nhận giờ Ra ca chính xác. Bảng công 31 ngày cá nhân hiển thị trạng thái công đủ (1 công) của ngày làm việc tương ứng.',
            'CẦN NGƯỜI THỬ', '', ''
        ],
        [
            5, 'PILOT-STEP-05', 'Thử chấm công ngoài bán kính nhà xưởng', 'worker',
            'Công nhân đứng ở vị trí ngoài phạm vi công ty (> 200m) hoặc dùng mạng 4G ở nhà, quét thử mã QR của Kiosk.',
            'Hệ thống từ chối HTTP 400 kèm thông báo rõ ràng: "Vị trí của bạn nằm ngoài bán kính cho phép của công ty". Không ghi nhận công.',
            'CẦN NGƯỜI THỬ', '', ''
        ],
        [
            6, 'PILOT-STEP-06', 'Quy trình nộp đơn nghỉ phép -> Duyệt -> Ký hiệu P', 'worker / admin',
            'Worker nộp đơn nghỉ phép (LEAVE) ngày mai. Admin đăng nhập Web PC, vào Quản lý đơn từ, nhấn Duyệt đơn. Kế toán mở Ma trận công 31 ngày.',
            'Đơn chuyển trạng thái APPROVED. Ô công của ngày nghỉ trên bảng ma trận công tự động hiển thị ký hiệu "P" (Nghỉ phép có hưởng lương).',
            'CẦN NGƯỜI THỬ', 'reports/screens/L3_Run1_TC-L3-UI-LEAVE-P_AFTER_414x896.png', ''
        ],
        [
            7, 'PILOT-STEP-07', 'Kế toán đối soát, Chốt kỳ công & Xuất lương', 'accountant',
            'Kế toán mở màn hình Bảng công ma trận, kiểm tra số lượng bản ghi is_low_trust, nhấn "Khóa Sổ Kỳ Công" tháng hiện tại, sau đó bấm Xuất bảng lương CSV/Excel.',
            'Kỳ công hiển thị "Đã Khóa Sổ". Mọi thao tác sửa công hoặc duyệt đơn cũ bị chặn. File Excel bảng lương xuất ra đầy đủ các cột lương, OT, bảo hiểm, không dính lỗi công thức CSV.',
            'CẦN NGƯỜI THỬ', 'reports/screens/L3_Run1_TC-L3-UI-PERIOD-LOCK_AFTER_414x896.png', ''
        ],
        [
            8, 'PILOT-STEP-08', 'Khóa tài khoản & Thu hồi quyền tức thì', 'admin / worker',
            'Admin vào danh sách nhân viên, gạt công tắc Tạm Khóa tài khoản của một nhân viên. Nhân viên đó trên điện thoại nhấn bất kỳ nút nào trên app.',
            'Phiên làm việc của nhân viên lập tức bị hủy (0-delay Instant Revocation), văng về màn hình Đăng nhập kèm thông báo tài khoản bị khóa.',
            'CẦN NGƯỜI THỬ', 'reports/screens/L3_Run1_TC-L3-UI-INSTANT-REVOKE_AFTER_360x640.png', ''
        ],
        [
            9, 'PILOT-STEP-09', 'Kiểm tra màn hình chẩn đoán /diagnostics', 'admin',
            'Admin truy cập menu /diagnostics trên máy điện thoại Staging. Chạy tuần tự 7 bước kiểm tra SDK Zalo, Token, GPS, Camera, Quét QR, DB & Commit.',
            '7 bước đều vượt qua hoặc hiển thị thông báo chi tiết của Zalo. Thông tin commit hash và kết nối MySQL hiển thị chính xác. Không lộ ZALO_APP_SECRET.',
            'CẦN NGƯỜI THỬ', 'g7_diagnostics_screen_7steps.png', ''
        ],
        [
            10, 'PILOT-STEP-10', 'Kiểm tra mở rộng & Tương thích giao diện', 'all',
            'Thử nghiệm giao diện ứng dụng trên 3 cỡ máy thực tế: Màn hình nhỏ (iPhone SE / 360x640), Màn hình tiêu chuẩn (iPhone 12/13/14 / 375x812) và Màn hình lớn (iPhone Plus/Max / 414x896).',
            'Giao diện co giãn chuẩn responsive, không bị tràn chữ (text overflow), nút bấm dễ chạm, bảng ma trận công cuộn mượt mà.',
            'CẦN NGƯỜI THỬ', 'reports/screens/L3_Run1_TC-L3-UI-LOGIN-WORKER-01_360x640.png', ''
        ]
    ];

    let rowIdx = 4;
    for (const step of pilotSteps) {
        const row = wsPilot.getRow(rowIdx);
        row.values = step;
        row.alignment = { vertical: 'middle', wrapText: true };
        // Highlight cột trạng thái
        row.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell(7).font = { bold: true, color: { argb: 'FFD97706' } };
        row.height = 35;
        rowIdx++;
    }

    // Bảng 2: Điều kiện dừng Pilot
    rowIdx += 2;
    wsPilot.mergeCells(`A${rowIdx}:I${rowIdx}`);
    wsPilot.getCell(`A${rowIdx}`).value = 'ĐIỀU KIỆN DỪNG CHẠY THỬ PILOT (STOP CRITERIA / KILL SWITCHES)';
    wsPilot.getCell(`A${rowIdx}`).font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    wsPilot.getCell(`A${rowIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    wsPilot.getRow(rowIdx).height = 24;

    const stopCriteria = [
        ['1. Tỷ lệ chấm công thất bại do lỗi hệ thống / lỗi mạng vượt quá 5% tổng số lượt chấm công trong một ngày.'],
        ['2. Tỷ lệ bản ghi chấm công bị đánh dấu nghi vấn hạ cấp / tọa độ raw (is_low_trust > 0) vượt quá 15%.'],
        ['3. Phát hiện lỗi nghiêm trọng tính sai tiền lương hoặc sai sót dữ liệu ma trận công ảnh hưởng quyền lợi người lao động.'],
        ['4. Sự cố treo máy chủ Node.js Backend hoặc nghẽn CSDL MySQL kéo dài quá 3 phút trong giờ cao điểm vào/ra ca.'],
        ['5. Phát hiện lỗ hổng rò rỉ dữ liệu cá nhân hoặc vượt quyền trái phép chưa được kiểm soát.']
    ];

    rowIdx++;
    for (const crit of stopCriteria) {
        wsPilot.mergeCells(`A${rowIdx}:I${rowIdx}`);
        wsPilot.getCell(`A${rowIdx}`).value = crit[0];
        wsPilot.getCell(`A${rowIdx}`).font = { italic: true, color: { argb: 'FF991B1B' } };
        wsPilot.getRow(rowIdx).height = 20;
        rowIdx++;
    }

    // Bảng 3: Người nhận phản hồi
    rowIdx++;
    wsPilot.mergeCells(`A${rowIdx}:I${rowIdx}`);
    wsPilot.getCell(`A${rowIdx}`).value = 'ĐẦU MỐI TIẾP NHẬN PHẢN HỒI & XỬ LÝ SỰ CỐ PILOT';
    wsPilot.getCell(`A${rowIdx}`).font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    wsPilot.getCell(`A${rowIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    wsPilot.getRow(rowIdx).height = 24;

    const contacts = [
        ['1. Kỹ thuật viên phụ trách hệ thống (Technical Lead): Nguyễn Văn An (SĐT/Zalo: 09xx-xxx-xxx)'],
        ['2. Cán bộ điều phối tại nhà máy (Plant Coordinator): Trưởng ca sản xuất Sedinco'],
        ['3. Kênh tiếp nhận sự cố khẩn cấp: Nhóm Zalo "Sedinco HR - Đội Phản Ứng Nhanh Pilot" (Hỗ trợ 24/7 trong tuần chạy thử)']
    ];
    rowIdx++;
    for (const c of contacts) {
        wsPilot.mergeCells(`A${rowIdx}:I${rowIdx}`);
        wsPilot.getCell(`A${rowIdx}`).value = c[0];
        wsPilot.getCell(`A${rowIdx}`).font = { bold: false };
        wsPilot.getRow(rowIdx).height = 20;
        rowIdx++;
    }

    // Set độ rộng cột
    wsPilot.columns = [
        { width: 6 },  // STT
        { width: 18 }, // Mã
        { width: 28 }, // Tên
        { width: 14 }, // Vai trò
        { width: 40 }, // Thao tác
        { width: 38 }, // Kết quả kỳ vọng
        { width: 18 }, // Kết quả của tôi
        { width: 35 }, // Ảnh
        { width: 30 }  // Thông báo lỗi
    ];

    // =========================================================================
    // SHEET 2: RỦI RO CÒN LẠI
    // =========================================================================
    console.log('[EXCEL] Đang tạo sheet "Rủi ro còn lại"...');
    const wsRisk = wb.addWorksheet('Rủi ro còn lại', { views: [{ showGridLines: true }] });

    wsRisk.mergeCells('A1:G1');
    wsRisk.getCell('A1').value = 'SEDINCO HR - MA TRẬN PHÂN TÍCH RỦI RO CÒN LẠI & BIỆN PHÁP QUẢN LÝ (PILOT)';
    wsRisk.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    wsRisk.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B1B' } };
    wsRisk.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
    wsRisk.getRow(1).height = 30;

    const riskHeaders = [
        'STT', 'Mã Rủi Ro', 'Tên Rủi Ro & Mô Tả', 'Mức Độ Rủi Ro',
        'Nguyên Nhân & Kịch Bản Gian Lận', 'Biện Pháp Quản Lý Kỹ Thuật & Vận Hành Đề Xuất',
        'Yêu Cầu Phê Duyệt Pháp Lý & Tuân Thủ'
    ];
    wsRisk.getRow(3).values = riskHeaders;
    wsRisk.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    wsRisk.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB91C1C' } };
    wsRisk.getRow(3).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    wsRisk.getRow(3).height = 25;

    const risks = [
        [
            1, 'RISK-01', 'Mật khẩu ban đầu mặc định + must_change_password', 'Trung Bình',
            'Khi import nhân viên từ CSV, toàn bộ nhân viên được cấp mật khẩu ban đầu giống nhau (ví dụ: Sedinco@2026). Kẻ xấu nội bộ có thể đoán mã NV và đổi mật khẩu trước.',
            'Kỹ thuật: Bắt buộc must_change_password=1, không bao giờ log mật khẩu. Vận hành: Phát mã kích hoạt riêng hoặc chia đợt phát mật khẩu trực tiếp cho từng tổ trưởng.',
            'Nội quy lao động: Quy định hành vi tự ý truy cập tài khoản đồng nghiệp là vi phạm kỷ luật.'
        ],
        [
            2, 'RISK-02', 'Khóa đăng nhập dây chuyền trên IP NAT Wi-Fi chung', 'Cao',
            'Toàn bộ công nhân xưởng cùng kết nối 1 mạng Wi-Fi công ty ra ngoài Internet qua 1 IP NAT. Kẻ xấu cố tình nhập sai mật khẩu 50 lần từ IP này có thể kích hoạt khóa IP tạm thời.',
            'Kỹ thuật: Đã triển khai cơ chế Phân lập DoS theo IP (Composite lock) - chỉ khóa riêng tài khoản bị brute-force, người dùng có IP quen thuộc vẫn vào được kèm throttle delay.',
            'Không áp dụng'
        ],
        [
            3, 'RISK-03', 'Ứng dụng Fake GPS can thiệp cấp hệ điều hành', 'Cao',
            'Công nhân sử dụng điện thoại Android bật tính năng "Allow mock locations" hoặc cài đặt phần mềm Fake GPS giả lập vị trí đứng tại cổng nhà máy.',
            'Kỹ thuật: Sử dụng Token getLocation từ Zalo SDK (giải mã phía server); kết hợp mã Dynamic QR đổi mới mỗi 30s tại Kiosk cổng xưởng (phải có mặt thật mới thấy QR).',
            'BẮT BUỘC PHÁP LÝ DUYỆT: Thỏa thuận thu thập vị trí GPS và ảnh chụp theo Nghị định 13/2023/NĐ-CP.'
        ],
        [
            4, 'RISK-04', 'Gian lận chụp ảnh hoặc livestream QR Kiosk gửi từ xa', 'Trung Bình',
            'Một người đứng tại cổng chụp màn hình Kiosk rồi gửi ảnh QR qua Zalo/Telegram cho người ở nhà quét chấm công.',
            'Kỹ thuật: TTL của mã QR chỉ là 30 giây (mã v2 có gắn timestamp và nonce, dùng 1 lần duy nhất). Độ trễ chụp gửi ảnh thường vượt quá 30s, giảm thiểu 80% rủi ro.',
            'Nội quy lao động: Cấm chụp và chia sẻ hình ảnh mã QR Kiosk của công ty.'
        ],
        [
            5, 'RISK-05', 'Cho mượn tài khoản Zalo hoặc nhờ người khác chấm công hộ', 'Cao',
            'Công nhân nhờ đồng nghiệp đăng nhập tài khoản Zalo của mình trên điện thoại của họ để chấm công hộ.',
            'Kỹ thuật: Mỗi lần chấm công đều bắt buộc chụp ảnh khuôn mặt selfie (check_in_image) và kiểm tra cờ ràng buộc thiết bị (bound_device_id). Giai đoạn 2 bật enforced.',
            'BẮT BUỘC PHÁP LÝ DUYỆT: Cam kết sử dụng tài khoản định danh cá nhân và đồng ý nhận diện ảnh khuôn mặt.'
        ],
        [
            6, 'RISK-06', 'Thiết bị di động bị can thiệp sâu (Rooted / Jailbreak)', 'Trung Bình',
            'Người dùng can thiệp vào bộ nhớ máy ảo hoặc ứng dụng Zalo đã chỉnh sửa (modded client) để gửi giả mạo dữ liệu cảm biến.',
            'Kỹ thuật: Giai đoạn Pilot đánh dấu cảnh báo is_suspicious=1 khi có bất thường về thiết bị; đối soát danh sách suspicious hàng tuần trước khi chốt công.',
            'Chính sách BYOD (Bring Your Own Device) quy định rõ trách nhiệm bảo mật thiết bị cá nhân.'
        ],
        [
            7, 'RISK-07', 'Ảnh chụp khuôn mặt Base64 lưu trực tiếp trong CSDL MySQL', 'Cao',
            'Mỗi lượt chấm công lưu 1 ảnh Base64 (~50KB-150KB) vào cột check_in_image của bảng attendance_logs. Với 200 công nhân x 2 lượt/ngày, DB tăng ~600MB/tháng.',
            'Kỹ thuật ngắn hạn: Đã giới hạn kích thước tối đa 2MB, nén ảnh phía client. Cần triển khai khẩn cấp backlog chuyển ảnh sang Object Storage (S3) và chính sách xóa sau 60 ngày.',
            'Chính sách lưu trữ dữ liệu cá nhân: Cần quy định rõ thời hạn lưu trữ ảnh tối đa (ví dụ 60 hoặc 90 ngày) rồi tự động hủy.'
        ],
        [
            8, 'RISK-08', 'Hệ thống chỉ hỗ trợ duy nhất 1 điểm làm việc trụ sở', 'Trung Bình',
            'Bảng branches không tồn tại trong CSDL. Toàn bộ tính toán khoảng cách phụ thuộc vào 1 tọa độ trong company_settings. Không hỗ trợ công nhân đi công trình xa.',
            'Kỹ thuật: Trong giai đoạn Pilot chỉ áp dụng cho khối nhà máy cố định. Công nhân đi công trình áp dụng quy trình nộp đơn bổ sung công / công tác ngoài.',
            'Quy chế chấm công đối với nhân sự làm việc ngoài hiện trường.'
        ]
    ];

    let rIdx = 4;
    for (const r of risks) {
        const row = wsRisk.getRow(rIdx);
        row.values = r;
        row.alignment = { vertical: 'middle', wrapText: true };
        // Highlight mức độ rủi ro
        const cellRisk = row.getCell(4);
        cellRisk.alignment = { vertical: 'middle', horizontal: 'center' };
        if (r[3] === 'Cao') {
            cellRisk.font = { bold: true, color: { argb: 'FFDC2626' } };
        } else {
            cellRisk.font = { bold: true, color: { argb: 'FFD97706' } };
        }
        row.height = 40;
        rIdx++;
    }

    wsRisk.columns = [
        { width: 6 },  // STT
        { width: 14 }, // Mã
        { width: 32 }, // Tên
        { width: 16 }, // Mức độ
        { width: 38 }, // Nguyên nhân
        { width: 42 }, // Biện pháp
        { width: 35 }  // Pháp lý
    ];

    // =========================================================================
    // SHEET 3: BACKLOG CHUYÊN NGHIỆP
    // =========================================================================
    console.log('[EXCEL] Đang tạo sheet "Backlog chuyên nghiệp"...');
    const wsBacklog = wb.addWorksheet('Backlog chuyên nghiệp', { views: [{ showGridLines: true }] });

    wsBacklog.mergeCells('A1:F1');
    wsBacklog.getCell('A1').value = 'SEDINCO HR - DANH MỤC CẢI TIẾN & BACKLOG CHUYÊN NGHIỆP SAU PILOT';
    wsBacklog.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    wsBacklog.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
    wsBacklog.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
    wsBacklog.getRow(1).height = 30;

    const backlogHeaders = [
        'STT', 'Hạng Mục Cải Tiến', 'Mô Tả Chi Tiết Giải Pháp Kỹ Thuật',
        'Mức Độ Ưu Tiên', 'Lý Do Nghiệp Vụ & Kỹ Thuật', 'Điều Kiện Tiên Quyết'
    ];
    wsBacklog.getRow(3).values = backlogHeaders;
    wsBacklog.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    wsBacklog.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    wsBacklog.getRow(3).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    wsBacklog.getRow(3).height = 25;

    const backlogs = [
        [
            1, 'Hỗ trợ đa điểm làm việc & Chi nhánh (Multi-branch)',
            'Tạo mới bảng branches (id, name, lat, lng, radius). Gắn branch_id vào kiosk_devices, dynamic_qr_sessions và employees. Cập nhật Geofence kiểm tra theo chi nhánh của nhân viên.',
            'P1 (Cao)',
            'Cần thiết khi Sedinco mở rộng triển khai cho các công trường xây dựng độc lập ngoài nhà máy chính.',
            'Phê duyệt thay đổi schema CSDL MySQL.'
        ],
        [
            2, 'Hỗ trợ ca làm việc linh hoạt & Ca xoay tua (Shift Roster)',
            'Thêm bảng work_shifts (shift_name, start_time, end_time, grace_minutes) và employee_shift_assignments. Tự động so khớp giờ check-in với ca được phân công.',
            'P1 (Cao)',
            'Nhà máy sản xuất vận hành theo 3 ca (sáng, chiều, đêm); cấu hình ca hành chính cố định 08:00-17:00 hiện tại không đáp ứng được.',
            'Thống nhất quy chế phân ca từ phòng Nhân sự.'
        ],
        [
            3, 'Kích hoạt tài khoản bằng mã OTP một lần (One-Time Activation)',
            'Bỏ mật khẩu mặc định khởi tạo. Gửi mã liên kết một lần (One-Time Token) qua tin nhắn Zalo ZNS hoặc SMS để nhân viên tự đặt mật khẩu mạnh đầu tiên.',
            'P2 (Trung Bình)',
            'Triệt tiêu rủi ro lộ lọt mật khẩu khởi tạo mặc định trong file CSV nạp nhân sự.',
            'Tích hợp Zalo Notification Service (ZNS) hoặc SMS Brandname.'
        ],
        [
            4, 'Chuyển đổi lưu trữ ảnh sang Object Storage (S3 / Cloud Storage)',
            'Tách trường check_in_image ra khỏi bảng attendance_logs. Upload ảnh selfie trực tiếp lên AWS S3 / Cloudflare R2 / MinIO, DB chỉ lưu URL. Thiết lập Lifecycle Rule xóa ảnh sau 90 ngày.',
            'P1 (Cao)',
            'Ngăn chặn nguy cơ CSDL MySQL bị phình to làm chậm truy vấn sao lưu (mysqldump) và giảm chi phí lưu trữ DB.',
            'Đăng ký tài khoản Cloud Storage và cấu hình IAM bucket.'
        ],
        [
            5, 'Hệ thống giám sát & Cảnh báo thời gian thực (Monitoring & Alerts)',
            'Tích hợp Prometheus + Grafana hoặc Telegram Bot thông báo tức thì khi: có IP lạ bị khóa brute-force, tỷ lệ chấm công lỗi > 5%, hoặc phát hiện hạ cấp định vị nghi vấn.',
            'P2 (Trung Bình)',
            'Giúp đội ngũ IT phát hiện sớm các cuộc tấn công mạng hoặc sự cố rớt mạng Kiosk trước khi công nhân phản ánh.',
            'Máy chủ Staging/Production cho phép kết nối webhook.'
        ],
        [
            6, 'Tách Web Admin PC thành ứng dụng độc lập',
            'Tách giao diện Quản trị / Kế toán ra khỏi repository Zalo Mini App thành một ứng dụng React SPA riêng biệt (chạy trên sub-domain admin.sedinco.vn).',
            'P2 (Trung Bình)',
            'Giảm dung lượng bundle của Zalo Mini App trên điện thoại di động, tăng tốc độ tải trang cho công nhân và bảo mật tách biệt.',
            'Cấu hình hạ tầng domain và proxy riêng cho Admin Web.'
        ],
        [
            7, 'Tinh chỉnh ngưỡng phát hiện gian lận sau 1 tháng chạy Pilot',
            'Thu thập dữ liệu thực tế về độ trôi GPS trong xưởng, tốc độ di chuyển và thời gian giữa các lần chấm công để hiệu chỉnh các hằng số trong anomalyDetector.',
            'P2 (Trung Bình)',
            'Giảm tỷ lệ báo động giả (False Positive Rate) xuống mức tối thiểu dựa trên dữ liệu địa lý thực địa.',
            'Đã có dữ liệu chạy thử thực tế tối thiểu 30 ngày.'
        ],
        [
            8, 'Benchmark hiệu năng tải trên máy chủ Production thực tế',
            'Chạy lại bài kiểm thử tải 50 và 500 đồng thời với đúng cấu hình CPU, RAM, băng thông mạng và dịch vụ MySQL Cloud của môi trường Production thật.',
            'P1 (Cao)',
            'Đảm bảo hệ thống không bị nghẽn socket hoặc nghẽn connection pool vào khung giờ 07:30 - 08:00 sáng khi hàng trăm công nhân vào ca cùng lúc.',
            'Môi trường Production đã được thiết lập hoàn tất.'
        ]
    ];

    let bIdx = 4;
    for (const b of backlogs) {
        const row = wsBacklog.getRow(bIdx);
        row.values = b;
        row.alignment = { vertical: 'middle', wrapText: true };
        const cellPri = row.getCell(4);
        cellPri.alignment = { vertical: 'middle', horizontal: 'center' };
        if (b[3].startsWith('P1')) {
            cellPri.font = { bold: true, color: { argb: 'FFDC2626' } };
        } else if (b[3].startsWith('P2')) {
            cellPri.font = { bold: true, color: { argb: 'FFD97706' } };
        } else {
            cellPri.font = { bold: false, color: { argb: 'FF4B5563' } };
        }
        row.height = 38;
        bIdx++;
    }

    wsBacklog.columns = [
        { width: 6 },  // STT
        { width: 28 }, // Hạng mục
        { width: 44 }, // Mô tả giải pháp
        { width: 16 }, // Ưu tiên
        { width: 38 }, // Lý do
        { width: 32 }  // Điều kiện
    ];

    // Lưu lại file
    await wb.xlsx.writeFile(EXCEL_PATH);
    console.log(`[EXCEL] THÀNH CÔNG: Đã cập nhật file ${EXCEL_PATH} với 3 sheet mới!`);
}

main().catch(err => {
    console.error('[THẤT BẠI]', err);
    process.exit(1);
});
