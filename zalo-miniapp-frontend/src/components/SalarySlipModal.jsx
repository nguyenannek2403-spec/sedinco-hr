import React from "react";
import { Printer, X, DollarSign, Award, ShieldCheck, Building } from "lucide-react";
import sedincoLogo from "../static/sedinco-logo.png";

export default function SalarySlipModal({ payrollItem, month, year, onClose }) {
  if (!payrollItem) return null;

  const baseSalary = Number(payrollItem.baseSalary) || 0;
  const workDays = Number(payrollItem.totalWorkDays) || 0;
  const salaryByWork = Number(payrollItem.salaryByWork) || 0;
  const otAmount = Number(payrollItem.otAmount) || 0;
  const totalAllowance = Number(payrollItem.totalAllowance) || 0;
  const insurance = Number(payrollItem.insuranceDeduction || payrollItem.totalInsurance) || 0;
  const netSalary = Number(payrollItem.netSalary) || 0;

  // Chi tiết phụ cấp định chuẩn Sedinco
  const allowanceLunch = 730000;
  const allowanceFuel = 500000;
  const allowanceHousing = 1000000;
  const allowanceBonus = 1500000;
  const allowanceResponsibility = totalAllowance > 3730000 ? totalAllowance - 3730000 : 0;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border-2 border-slate-300 my-8">
        
        {/* Thanh công cụ Modal (Không in khi bấm Print) */}
        <div className="no-print bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b-2 border-slate-800">
          <div className="flex items-center gap-2.5">
            <DollarSign className="text-emerald-400" size={24} />
            <h3 className="font-black text-base tracking-wide">
              PHIẾU LƯƠNG ĐIỆN TỬ — THÁNG {month}/{year}
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-black border-2 border-emerald-500 shadow-md cursor-pointer"
            >
              <Printer size={16} />
              <span>In Phiếu Lương</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl border border-white/20 text-white cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Nội dung Phiếu Lương chuẩn in ấn Doanh Nghiệp */}
        <div className="p-8 text-slate-800 space-y-6 print:p-0 print:space-y-4">
          
          {/* Header Doanh nghiệp */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <img src={sedincoLogo} alt="SEDINCO Logo" className="w-9 h-9 object-contain" />
                <h2 className="font-black text-sm md:text-base text-slate-900 uppercase">
                  CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO
                </h2>
              </div>
              <p className="text-xs text-slate-600 mt-1 font-medium">
                Khu Công Nghiệp Hòa Khánh, Liên Chiểu, TP. Đà Nẵng
              </p>
              <p className="text-xs text-slate-600 font-medium">
                Mã Số Thuế: 0401899999 • Hotline: 0236.3888.999
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 block">
                Mẫu số: 02-LDTL
              </span>
              <span className="inline-block mt-1 px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-900 border-2 border-blue-300">
                Lưu hành nội bộ
              </span>
            </div>
          </div>

          {/* Tiêu đề Phiếu */}
          <div className="text-center">
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight uppercase">
              PHIẾU THANH TOÁN TIỀN LƯƠNG & PHỤ CẤP
            </h1>
            <p className="text-sm text-slate-700 font-bold mt-1">
              Kỳ trả lương: Tháng {String(month).padStart(2, "0")} năm {year} (Công chuẩn: 26.0 ngày)
            </p>
          </div>

          {/* Thông tin Nhân viên */}
          <div className="bg-slate-50 rounded-2xl p-4 border-2 border-slate-200 grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500 block text-xs font-bold">Họ và tên nhân sự:</span>
              <strong className="text-slate-900 text-base font-black">{payrollItem.ho_ten}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-xs font-bold">Mã định danh (ID):</span>
              <strong className="text-blue-800 font-mono text-base font-black">{payrollItem.ma_nv || payrollItem.id_nhan_vien}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-xs font-bold">Chức vụ / Vị trí:</span>
              <span className="text-slate-800 font-bold">{payrollItem.chuc_danh || "Kỹ sư / Nhân viên"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-xs font-bold">Ngày công thực tế:</span>
              <span className="text-emerald-800 font-black">{workDays} / 26 công ({((workDays/26)*100).toFixed(0)}%)</span>
            </div>
          </div>

          {/* Bảng Chi tiết Tính Lương */}
          <div className="border-2 border-slate-200 rounded-2xl overflow-hidden text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-black border-b-2 border-slate-300">
                  <th className="p-3">Khoản Mục Thu Nhập & Khấu Trừ</th>
                  <th className="p-3 text-center">Căn Cứ / Tỷ Lệ</th>
                  <th className="p-3 text-right">Số Tiền (VND)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="p-3 font-semibold text-slate-800">1. Lương cơ bản theo hợp đồng</td>
                  <td className="p-3 text-center text-slate-600 font-medium">Mức đóng bảo hiểm</td>
                  <td className="p-3 text-right font-black text-slate-900 text-sm">{baseSalary.toLocaleString("vi-VN")} đ</td>
                </tr>
                <tr>
                  <td className="p-3 font-semibold text-slate-800">2. Lương thực tế theo ngày công</td>
                  <td className="p-3 text-center text-blue-700 font-bold">{workDays} công / 26</td>
                  <td className="p-3 text-right font-black text-blue-800 text-sm">{salaryByWork.toLocaleString("vi-VN")} đ</td>
                </tr>
                
                {/* Nhóm phụ cấp */}
                <tr className="bg-slate-50/80 font-black text-slate-800">
                  <td colSpan={2} className="p-2.5 pl-3 uppercase text-xs text-slate-600">
                    3. Các khoản phụ cấp theo chế độ:
                  </td>
                  <td className="p-2.5 text-right font-black text-slate-900 text-sm">{totalAllowance.toLocaleString("vi-VN")} đ</td>
                </tr>
                <tr className="text-slate-700 text-xs">
                  <td className="p-2 pl-6 font-medium">• Phụ cấp ăn trưa ca ngày</td>
                  <td className="p-2 text-center text-slate-500 font-medium">Định mức công ty</td>
                  <td className="p-2 text-right font-semibold">{allowanceLunch.toLocaleString("vi-VN")} đ</td>
                </tr>
                <tr className="text-slate-700 text-xs">
                  <td className="p-2 pl-6 font-medium">• Phụ cấp xăng xe & đi lại</td>
                  <td className="p-2 text-center text-slate-500 font-medium">Hỗ trợ công trình</td>
                  <td className="p-2 text-right font-semibold">{allowanceFuel.toLocaleString("vi-VN")} đ</td>
                </tr>
                <tr className="text-slate-700 text-xs">
                  <td className="p-2 pl-6 font-medium">• Phụ cấp nhà ở & lưu trú</td>
                  <td className="p-2 text-center text-slate-500 font-medium">Theo chế độ</td>
                  <td className="p-2 text-right font-semibold">{allowanceHousing.toLocaleString("vi-VN")} đ</td>
                </tr>
                <tr className="text-slate-700 text-xs">
                  <td className="p-2 pl-6 font-medium">• Thưởng hoàn thành công việc (HTCV)</td>
                  <td className="p-2 text-center text-slate-500 font-medium">Đạt KPI</td>
                  <td className="p-2 text-right font-semibold">{allowanceBonus.toLocaleString("vi-VN")} đ</td>
                </tr>
                {allowanceResponsibility > 0 && (
                  <tr className="text-slate-700 text-xs">
                    <td className="p-2 pl-6 font-medium">• Phụ cấp trách nhiệm / tiếp khách</td>
                    <td className="p-2 text-center text-slate-500 font-medium">Vị trí công tác</td>
                    <td className="p-2 text-right font-semibold">{allowanceResponsibility.toLocaleString("vi-VN")} đ</td>
                  </tr>
                )}

                {/* Tiền OT */}
                <tr>
                  <td className="p-3 font-semibold text-slate-800">4. Tiền làm thêm giờ (OT Ngoài giờ)</td>
                  <td className="p-3 text-center text-indigo-700 font-bold">Hệ số 1.5x - 3.0x</td>
                  <td className="p-3 text-right font-black text-indigo-800 text-sm">+{otAmount.toLocaleString("vi-VN")} đ</td>
                </tr>

                {/* Khấu trừ BHXH */}
                <tr className="text-rose-800 bg-rose-50/50">
                  <td className="p-3 font-semibold">5. Khấu trừ BHXH, BHYT, BHTN</td>
                  <td className="p-3 text-center font-bold">10.5% (Trích lương NV)</td>
                  <td className="p-3 text-right font-black text-sm">-{insurance.toLocaleString("vi-VN")} đ</td>
                </tr>

                {/* Tổng thực lĩnh Net */}
                <tr className="bg-emerald-50 text-emerald-950 font-black text-sm border-t-2 border-emerald-300">
                  <td className="p-4 uppercase tracking-wide">TỔNG LƯƠNG THỰC LĨNH (NET):</td>
                  <td className="p-4 text-center text-xs font-bold text-emerald-800">Chuyển khoản ATM</td>
                  <td className="p-4 text-right text-lg text-emerald-700 font-black">
                    {netSalary.toLocaleString("vi-VN")} đ
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Chữ ký 4 bên */}
          <div className="grid grid-cols-4 gap-2 pt-6 text-center text-xs border-t-2 border-slate-200">
            <div>
              <span className="font-black text-slate-900 block">Người Lập Biểu</span>
              <span className="text-xs text-slate-500 italic block mt-0.5">(Ký, họ tên)</span>
              <div className="h-14"></div>
              <span className="text-slate-700 font-bold">Phòng Kế Toán</span>
            </div>
            <div>
              <span className="font-black text-slate-900 block">Kế Toán Trưởng</span>
              <span className="text-xs text-slate-500 italic block mt-0.5">(Ký, họ tên)</span>
              <div className="h-14"></div>
              <span className="text-slate-700 font-bold">Tô Phương Linh</span>
            </div>
            <div>
              <span className="font-black text-slate-900 block">Tổng Giám Đốc</span>
              <span className="text-xs text-slate-500 italic block mt-0.5">(Duyệt & đóng dấu)</span>
              <div className="h-14"></div>
              <span className="text-slate-700 font-bold">Ban Giám Đốc</span>
            </div>
            <div>
              <span className="font-black text-slate-900 block">Người Nhận Lương</span>
              <span className="text-xs text-slate-500 italic block mt-0.5">(Ký xác nhận)</span>
              <div className="h-14"></div>
              <span className="text-slate-700 font-bold">{payrollItem.ho_ten}</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
