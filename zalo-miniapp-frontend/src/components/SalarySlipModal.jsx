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
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-100 my-8">
        
        {/* Thanh công cụ Modal (Không in khi bấm Print) */}
        <div className="no-print bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="text-emerald-400" size={20} />
            <h3 className="font-extrabold text-sm tracking-wide">
              PHIẾU LƯƠNG ĐIỆN TỬ — THÁNG {month}/{year}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Printer size={14} />
              <span>In Phiếu Lương</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-white/20 rounded-xl transition-all text-slate-300 hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Nội dung Phiếu Lương chuẩn in ấn Doanh Nghiệp */}
        <div className="p-8 text-slate-800 space-y-6 print:p-0 print:space-y-4">
          
          {/* Header Doanh nghiệp */}
          <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <img src={sedincoLogo} alt="SEDINCO Logo" className="w-8 h-8 object-contain" />
                <h2 className="font-black text-sm text-slate-900 uppercase">
                  CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO
                </h2>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Khu Công Nghiệp Hòa Khánh, Liên Chiểu, TP. Đà Nẵng
              </p>
              <p className="text-[11px] text-slate-500">
                Mã Số Thuế: 0401899999 • Hotline: 0236.3888.999
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Mẫu số: 02-LDTL
              </span>
              <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                Lưu hành nội bộ
              </span>
            </div>
          </div>

          {/* Tiêu đề Phiếu */}
          <div className="text-center">
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
              PHIẾU THANH TOÁN TIỀN LƯƠNG & PHỤ CẤP
            </h1>
            <p className="text-xs text-slate-600 font-medium mt-1">
              Kỳ trả lương: Tháng {String(month).padStart(2, "0")} năm {year} (Công chuẩn: 26.0 ngày)
            </p>
          </div>

          {/* Thông tin Nhân viên */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block text-[11px]">Họ và tên nhân sự:</span>
              <strong className="text-slate-900 text-sm font-black">{payrollItem.ho_ten}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Mã định danh (ID):</span>
              <strong className="text-blue-700 font-mono text-sm">{payrollItem.ma_nv || payrollItem.id_nhan_vien}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Chức vụ / Vị trí:</span>
              <span className="text-slate-800 font-semibold">{payrollItem.chuc_danh || "Kỹ sư / Nhân viên"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Ngày công thực tế:</span>
              <span className="text-emerald-700 font-black">{workDays} / 26 công ({((workDays/26)*100).toFixed(0)}%)</span>
            </div>
          </div>

          {/* Bảng Chi tiết Tính Lương */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-3">Khoản Mục Thu Nhập & Khấu Trừ</th>
                  <th className="p-3 text-center">Căn Cứ / Tỷ Lệ</th>
                  <th className="p-3 text-right">Số Tiền (VND)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-3 font-medium">1. Lương cơ bản theo hợp đồng</td>
                  <td className="p-3 text-center text-slate-500">Mức đóng bảo hiểm</td>
                  <td className="p-3 text-right font-bold text-slate-800">{baseSalary.toLocaleString("vi-VN")} đ</td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">2. Lương thực tế theo ngày công</td>
                  <td className="p-3 text-center text-blue-600 font-semibold">{workDays} công / 26</td>
                  <td className="p-3 text-right font-bold text-blue-700">{salaryByWork.toLocaleString("vi-VN")} đ</td>
                </tr>
                
                {/* Nhóm phụ cấp */}
                <tr className="bg-slate-50/70 font-semibold text-slate-700">
                  <td colSpan={2} className="p-2.5 pl-3 uppercase text-[11px] text-slate-500">
                    3. Các khoản phụ cấp theo chế độ:
                  </td>
                  <td className="p-2.5 text-right font-bold text-slate-700">{totalAllowance.toLocaleString("vi-VN")} đ</td>
                </tr>
                <tr className="text-slate-600 text-[11px]">
                  <td className="p-2 pl-6">• Phụ cấp ăn trưa ca ngày</td>
                  <td className="p-2 text-center text-slate-400">Định mức công ty</td>
                  <td className="p-2 text-right">{allowanceLunch.toLocaleString("vi-VN")} đ</td>
                </tr>
                <tr className="text-slate-600 text-[11px]">
                  <td className="p-2 pl-6">• Phụ cấp xăng xe & đi lại</td>
                  <td className="p-2 text-center text-slate-400">Hỗ trợ công trình</td>
                  <td className="p-2 text-right">{allowanceFuel.toLocaleString("vi-VN")} đ</td>
                </tr>
                <tr className="text-slate-600 text-[11px]">
                  <td className="p-2 pl-6">• Phụ cấp nhà ở & lưu trú</td>
                  <td className="p-2 text-center text-slate-400">Theo chế độ</td>
                  <td className="p-2 text-right">{allowanceHousing.toLocaleString("vi-VN")} đ</td>
                </tr>
                <tr className="text-slate-600 text-[11px]">
                  <td className="p-2 pl-6">• Thưởng hoàn thành công việc (HTCV)</td>
                  <td className="p-2 text-center text-slate-400">Đạt KPI</td>
                  <td className="p-2 text-right">{allowanceBonus.toLocaleString("vi-VN")} đ</td>
                </tr>
                {allowanceResponsibility > 0 && (
                  <tr className="text-slate-600 text-[11px]">
                    <td className="p-2 pl-6">• Phụ cấp trách nhiệm / tiếp khách</td>
                    <td className="p-2 text-center text-slate-400">Vị trí công tác</td>
                    <td className="p-2 text-right">{allowanceResponsibility.toLocaleString("vi-VN")} đ</td>
                  </tr>
                )}

                {/* Tiền OT */}
                <tr>
                  <td className="p-3 font-medium">4. Tiền làm thêm giờ (OT Ngoài giờ)</td>
                  <td className="p-3 text-center text-indigo-600 font-semibold">Hệ số 1.5x - 3.0x</td>
                  <td className="p-3 text-right font-bold text-indigo-700">+{otAmount.toLocaleString("vi-VN")} đ</td>
                </tr>

                {/* Khấu trừ BHXH */}
                <tr className="text-rose-700 bg-rose-50/40">
                  <td className="p-3 font-medium">5. Khấu trừ BHXH, BHYT, BHTN</td>
                  <td className="p-3 text-center font-bold">10.5% (Trích lương NV)</td>
                  <td className="p-3 text-right font-bold">-{insurance.toLocaleString("vi-VN")} đ</td>
                </tr>

                {/* Tổng thực lĩnh Net */}
                <tr className="bg-emerald-50 text-emerald-950 font-black text-sm">
                  <td className="p-3.5 uppercase tracking-wide">TỔNG LƯƠNG THỰC LĨNH (NET):</td>
                  <td className="p-3.5 text-center text-xs font-semibold text-emerald-700">Chuyển khoản ATM</td>
                  <td className="p-3.5 text-right text-base text-emerald-600 font-black">
                    {netSalary.toLocaleString("vi-VN")} đ
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Chữ ký 4 bên */}
          <div className="grid grid-cols-4 gap-2 pt-6 text-center text-xs border-t border-slate-200">
            <div>
              <span className="font-bold text-slate-800 block">Người Lập Biểu</span>
              <span className="text-[10px] text-slate-400 italic block mt-0.5">(Ký, họ tên)</span>
              <div className="h-14"></div>
              <span className="text-slate-600 font-medium">Phòng Kế Toán</span>
            </div>
            <div>
              <span className="font-bold text-slate-800 block">Kế Toán Trưởng</span>
              <span className="text-[10px] text-slate-400 italic block mt-0.5">(Ký, họ tên)</span>
              <div className="h-14"></div>
              <span className="text-slate-600 font-medium">Tô Phương Linh</span>
            </div>
            <div>
              <span className="font-bold text-slate-800 block">Tổng Giám Đốc</span>
              <span className="text-[10px] text-slate-400 italic block mt-0.5">(Duyệt & đóng dấu)</span>
              <div className="h-14"></div>
              <span className="text-slate-600 font-medium">Ban Giám Đốc</span>
            </div>
            <div>
              <span className="font-bold text-slate-800 block">Người Nhận Lương</span>
              <span className="text-[10px] text-slate-400 italic block mt-0.5">(Ký xác nhận)</span>
              <div className="h-14"></div>
              <span className="text-slate-600 font-medium">{payrollItem.ho_ten}</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
