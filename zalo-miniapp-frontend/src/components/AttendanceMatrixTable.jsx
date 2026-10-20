import React, { useState } from "react";
import {
  Calendar,
  Search,
  Filter,
  Download,
  Printer,
  Edit3,
  CheckCircle2,
  Clock,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  AlertTriangle,
  ShieldCheck
} from "lucide-react";
import { safePost, sanitizeFormula, generateIdempotencyKey } from "../utils/api";
import PeriodLockModal from "./PeriodLockModal";
import { ROLES, hasPermission } from "../constants/roles";

const getBadgeStyle = (status) => {
  if (status === "1") return "bg-emerald-100 text-emerald-900 border-2 border-emerald-500 font-black";
  if (status === "0.5") return "bg-teal-100 text-teal-900 border-2 border-teal-500 font-black";
  if (status === "P") return "bg-amber-100 text-amber-900 border-2 border-amber-500 font-black";
  if (String(status).includes("OT")) return "bg-indigo-100 text-indigo-900 border-2 border-indigo-500 font-black";
  if (status === "L") return "bg-rose-100 text-rose-900 border-2 border-rose-500 font-black";
  if (status === "KP") return "bg-slate-200 text-slate-800 border-2 border-slate-400 font-black";
  return "text-slate-400 border border-slate-200 bg-slate-50/50 hover:bg-slate-100";
};

export default function AttendanceMatrixTable({
  attendanceData,
  month,
  year,
  onMonthChange,
  onRefresh,
  userRole = "admin",
  isLocked: propIsLocked,
  onShowToast,
  onRecordAuditLog
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingCell, setEditingCell] = useState(null); // { emp, dayIndex, currentStatus }
  const [selectedStatus, setSelectedStatus] = useState("1");
  const [otHours, setOtHours] = useState(2);
  const [editReason, setEditReason] = useState("");
  const [editError, setEditError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);

  const [internalLocked, setInternalLocked] = useState(() => {
    try {
      const saved = localStorage.getItem(`sedinco_locked_period_${year}_${month}`);
      return saved ? JSON.parse(saved).locked : false;
    } catch (e) {
      return false;
    }
  });

  const isLocked = propIsLocked !== undefined ? propIsLocked : internalLocked;

  // Tách quyền: Chỉ HR và Admin được sửa công khi kỳ CHƯA bị chốt
  const canEdit = !isLocked && (userRole === ROLES.HR || userRole === ROLES.ADMIN);

  // Số ngày trong tháng
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Lọc nhân sự theo từ khóa tìm kiếm
  const filteredData = (attendanceData || []).filter(item => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.ho_ten?.toLowerCase().includes(q) ||
      item.ma_nv?.toLowerCase().includes(q)
    );
  });

  const handleCellClick = (emp, dayIndex) => {
    if (isLocked) {
      if (onShowToast) {
        onShowToast(`Kỳ công tháng ${month}/${year} đã chốt sổ. Chỉ Quản Trị Viên mới có quyền mở khóa.`, "warning");
      }
      return;
    }
    if (userRole === ROLES.ACCOUNTANT) {
      if (onShowToast) {
        onShowToast("Tách quyền: Kế toán chỉ có quyền xem và chốt sổ, không được sửa dữ liệu công.", "warning");
      }
      return;
    }
    if (!canEdit) return;
    const currentVal = (emp.days && emp.days[dayIndex]) || "";
    setEditingCell({
      emp,
      dayNum: dayIndex + 1,
      currentStatus: currentVal
    });
    setSelectedStatus(currentVal || "1");
    setOtHours(2);
    setEditReason("");
    setEditError("");
  };

  const handleSaveCellAttendance = async () => {
    if (!editingCell) return;
    if (!editReason.trim()) {
      setEditError("Vui lòng nhập lý do điều chỉnh công (Bắt buộc theo quy chế kiểm toán).");
      return;
    }

    setIsSubmitting(true);
    setEditError("");
    try {
      const idempotencyKey = generateIdempotencyKey("att_edit");
      await safePost("/attendance/update", {
        ma_nv: editingCell.emp.ma_nv,
        day: editingCell.dayNum,
        month: month,
        year: year,
        status: selectedStatus,
        ot_hours: selectedStatus === "OT" || selectedStatus === "1/OT" ? otHours : 0,
        reason: editReason.trim()
      }, { idempotencyKey });

      if (onRecordAuditLog) {
        onRecordAuditLog(
          "Điều chỉnh ngày công",
          `Sửa công ngày ${editingCell.dayNum}/${month}/${year} của ${editingCell.emp.ho_ten} (${editingCell.emp.ma_nv}) thành [${selectedStatus || "Xóa công"}]`,
          editReason.trim()
        );
      }

      if (onShowToast) {
        onShowToast(`Đã cập nhật công ngày ${editingCell.dayNum}/${month} cho ${editingCell.emp.ho_ten}!`, "success");
      }
      setEditingCell(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      setEditError(err.message || "Không thể cập nhật ngày công.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xuất bảng chấm công sang CSV UTF-8
  const handleExportCSV = () => {
    const headers = ["Mã NV", "Họ và Tên", ...dayNumbers.map(d => `Ngày ${d}`), "Đủ công (1)", "Nửa công (0.5)", "Phép (P)", "Tăng ca (OT)"];
    const rows = filteredData.map(item => {
      const days = item.days || [];
      const count1 = days.filter(d => d === "1").length;
      const countHalf = days.filter(d => d === "0.5").length;
      const countP = days.filter(d => d === "P").length;
      const countOT = days.filter(d => String(d).includes("OT")).length;
      return [
        `"${sanitizeFormula(item.ma_nv)}"`,
        `"${sanitizeFormula(item.ho_ten)}"`,
        ...dayNumbers.map(d => `"${sanitizeFormula(days[d - 1] || "")}"`),
        count1,
        countHalf,
        countP,
        countOT
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Bang_Cham_Cong_Ma_Tran_Thang_${month}_${year}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm overflow-hidden">
      
      {/* Header Điều Khiển & Tìm Kiếm */}
      <div className="p-5 border-b-2 border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50/70">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="text-blue-600" size={24} />
            <h3 className="font-black text-lg md:text-xl text-slate-900 tracking-tight">
              BẢNG CHẤM CÔNG MA TRẬN TOÀN DOANH NGHIỆP
            </h3>
          </div>
          <p className="text-sm font-medium text-slate-600 mt-1">
            Tổng hợp dữ liệu điểm danh thực tế của toàn bộ cán bộ công nhân viên ({filteredData.length} nhân sự)
          </p>
        </div>

        {/* Thanh tác vụ: Tháng/Năm, Tìm kiếm & Nút hành động */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Bộ chọn tháng/năm */}
          <div className="flex items-center bg-white border-2 border-slate-300 rounded-xl px-2.5 py-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => onMonthChange(month > 1 ? month - 1 : 12, month > 1 ? year : year - 1)}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 cursor-pointer border border-transparent hover:border-slate-300"
              title="Tháng trước"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="font-black text-sm px-3 text-slate-900">
              Tháng {month}/{year}
            </span>
            <button
              type="button"
              onClick={() => onMonthChange(month < 12 ? month + 1 : 1, month < 12 ? year : year + 1)}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 cursor-pointer border border-transparent hover:border-slate-300"
              title="Tháng sau"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Ô tìm kiếm */}
          <div className="relative min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên hoặc mã NV..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm font-semibold bg-white border-2 border-slate-300 rounded-xl outline-none focus:border-blue-600 shadow-sm"
            />
          </div>

          {/* Nút Xuất CSV */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black px-4 py-2.5 rounded-xl border-2 border-emerald-700 shadow-sm cursor-pointer"
          >
            <Download size={16} />
            <span>Xuất CSV</span>
          </button>

          {/* Nút Làm Mới */}
          <button
            type="button"
            onClick={onRefresh}
            className="p-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border-2 border-slate-300 shadow-sm cursor-pointer"
            title="Làm mới dữ liệu"
          >
            <RefreshCw size={16} />
          </button>

          {/* Nút Chốt Công Kỳ Lương (Kế toán & Quản trị) */}
          {hasPermission(userRole, "canLockPeriod") && !isLocked && (
            <button
              type="button"
              onClick={() => setShowLockModal(true)}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-black px-4 py-2.5 rounded-xl border-2 border-rose-700 shadow-sm cursor-pointer"
            >
              <Lock size={16} />
              <span>Chốt Kỳ Công</span>
            </button>
          )}

          {/* Nút Mở Lại Kỳ Công Đã Chốt (Chỉ Quản Trị) */}
          {hasPermission(userRole, "canUnlockPeriod") && isLocked && (
            <button
              type="button"
              onClick={() => setShowLockModal(true)}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-black px-4 py-2.5 rounded-xl border-2 border-amber-700 shadow-sm cursor-pointer"
            >
              <Unlock size={16} />
              <span>Mở Lại Kỳ Đã Chốt</span>
            </button>
          )}

          {isLocked && !hasPermission(userRole, "canUnlockPeriod") && (
            <div className="flex items-center gap-2 bg-slate-200 text-slate-800 text-sm font-black px-4 py-2.5 rounded-xl border-2 border-slate-400">
              <Lock size={16} className="text-slate-600" />
              <span>Đã Khóa Sổ</span>
            </div>
          )}
        </div>
      </div>

      {/* Banner Cảnh Báo Nếu Kỳ Đã Chốt */}
      {isLocked && (
        <div className="px-5 py-3 bg-amber-100/80 border-b-2 border-amber-300 flex items-center justify-between text-sm text-amber-950 font-bold">
          <div className="flex items-center gap-2.5">
            <Lock size={18} className="text-amber-700 shrink-0" />
            <span>Kỳ công Tháng {month}/{year} đã được Kế toán chốt sổ. Toàn bộ bảng công ở chế độ CHỈ ĐỌC.</span>
          </div>
          {hasPermission(userRole, "canUnlockPeriod") && (
            <span className="text-xs text-amber-800 italic underline">Quản trị viên có thể mở khóa khi cần thiết</span>
          )}
        </div>
      )}

      {/* Chú giải ký hiệu */}
      <div className="px-5 py-3 bg-slate-100 border-b-2 border-slate-200 flex flex-wrap items-center gap-4 text-xs font-bold text-slate-700">
        <span className="font-black text-slate-900 text-sm">Ký hiệu:</span>
        <span className="flex items-center gap-1.5"><span className="w-7 h-6 rounded text-center inline-flex items-center justify-center text-xs font-black bg-emerald-100 text-emerald-900 border-2 border-emerald-500">1</span> Đủ công (1.0)</span>
        <span className="flex items-center gap-1.5"><span className="w-7 h-6 rounded text-center inline-flex items-center justify-center text-xs font-black bg-teal-100 text-teal-900 border-2 border-teal-500">0.5</span> Nửa công</span>
        <span className="flex items-center gap-1.5"><span className="w-7 h-6 rounded text-center inline-flex items-center justify-center text-xs font-black bg-amber-100 text-amber-900 border-2 border-amber-500">P</span> Có phép</span>
        <span className="flex items-center gap-1.5"><span className="w-7 h-6 rounded text-center inline-flex items-center justify-center text-xs font-black bg-indigo-100 text-indigo-900 border-2 border-indigo-500">OT</span> Tăng ca</span>
        <span className="flex items-center gap-1.5"><span className="w-7 h-6 rounded text-center inline-flex items-center justify-center text-xs font-black bg-rose-100 text-rose-900 border-2 border-rose-500">L</span> Ngày lễ (x3)</span>
        <span className="flex items-center gap-1.5"><span className="w-7 h-6 rounded text-center inline-flex items-center justify-center text-xs font-black bg-slate-200 text-slate-800 border-2 border-slate-400">KP</span> Không phép</span>
        {canEdit && <span className="ml-auto text-blue-700 font-extrabold">💡 Nhấp trực tiếp vào bất kỳ ô ngày nào để sửa công</span>}
        {isLocked && <span className="ml-auto text-rose-700 font-black">🔒 Bảng công đã bị khóa sổ</span>}
        {!isLocked && userRole === ROLES.ACCOUNTANT && <span className="ml-auto text-slate-600 font-bold">👁️ Kế toán xem đối soát & chốt số liệu</span>}
      </div>

      {/* Bảng Ma Trận (Horizontal scroll) */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs text-left">
          <thead>
            <tr className="bg-slate-100 text-slate-800 border-b-2 border-slate-300 uppercase font-black sticky top-0 z-10">
              <th className="p-3.5 pl-4 sticky left-0 bg-slate-100 z-20 min-w-[190px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                Nhân Sự
              </th>
              {dayNumbers.map(d => {
                const dayOfWeek = new Date(year, month - 1, d).getDay();
                const isSunday = dayOfWeek === 0;
                return (
                  <th
                    key={d}
                    className={`p-2 text-center min-w-[38px] border-l border-slate-200 ${
                      isSunday ? "bg-rose-100/60 text-rose-800" : ""
                    }`}
                  >
                    <div className="text-sm font-black">{d}</div>
                    <span className="text-[10px] font-bold text-slate-500 block">
                      {isSunday ? "CN" : `T${dayOfWeek + 1}`}
                    </span>
                  </th>
                );
              })}
              <th className="p-3 text-center bg-emerald-100/70 text-emerald-950 font-black border-l-2 border-slate-300 min-w-[60px] text-xs">
                Đủ (1)
              </th>
              <th className="p-3 text-center bg-teal-100/70 text-teal-950 font-black border-l-2 border-slate-300 min-w-[60px] text-xs">
                Nửa (0.5)
              </th>
              <th className="p-3 text-center bg-amber-100/70 text-amber-950 font-black border-l-2 border-slate-300 min-w-[60px] text-xs">
                Phép (P)
              </th>
              <th className="p-3 text-center bg-indigo-100/70 text-indigo-950 font-black border-l-2 border-slate-300 min-w-[60px] text-xs">
                OT (h)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={daysInMonth + 5} className="py-12 text-center text-slate-500 text-sm font-bold">
                  Không tìm thấy dữ liệu điểm danh phù hợp.
                </td>
              </tr>
            ) : (
              filteredData.map((emp, empIdx) => {
                const days = emp.days || [];
                const count1 = days.filter(d => d === "1").length;
                const countHalf = days.filter(d => d === "0.5").length;
                const countP = days.filter(d => d === "P").length;
                const countOT = days.filter(d => String(d).includes("OT")).length;

                return (
                  <tr key={emp.ma_nv || empIdx} className="hover:bg-blue-50/50 transition-colors">
                    {/* Cột cố định: Tên & Mã NV */}
                    <td className="p-3 pl-4 sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <div className="font-black text-slate-900 text-sm leading-tight">{emp.ho_ten}</div>
                      <div className="text-xs text-blue-700 font-mono font-bold mt-0.5">{emp.ma_nv}</div>
                    </td>

                    {/* 31 Cột ngày */}
                    {dayNumbers.map((d, dIdx) => {
                      const val = days[dIdx] || "";
                      const badgeClass = getBadgeStyle(val);
                      const isSunday = new Date(year, month - 1, d).getDay() === 0;

                      return (
                        <td
                          key={d}
                          onClick={() => handleCellClick(emp, dIdx)}
                          className={`p-1 text-center border-l border-slate-100 cursor-pointer select-none ${
                            isSunday ? "bg-rose-50/30" : ""
                          }`}
                          title={`Ngày ${d}/${month}: ${val || "Chưa có công"} (Nhấp để sửa)`}
                        >
                          <div
                            className={`w-8 h-8 mx-auto rounded-lg flex items-center justify-center text-xs font-black shadow-none ${badgeClass}`}
                          >
                            {val || "·"}
                          </div>
                        </td>
                      );
                    })}

                    {/* Cột Tổng Kết */}
                    <td className="p-2.5 text-center font-black text-emerald-900 bg-emerald-50/60 border-l-2 border-slate-300 text-sm">
                      {count1}
                    </td>
                    <td className="p-2.5 text-center font-black text-teal-900 bg-teal-50/60 border-l-2 border-slate-300 text-sm">
                      {countHalf}
                    </td>
                    <td className="p-2.5 text-center font-black text-amber-900 bg-amber-50/60 border-l-2 border-slate-300 text-sm">
                      {countP}
                    </td>
                    <td className="p-2.5 text-center font-black text-indigo-900 bg-indigo-50/60 border-l-2 border-slate-300 text-sm">
                      {countOT}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Chỉnh Sửa Công Ô Trực Tiếp */}
      {editingCell && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5 border-2 border-slate-200">
            <div className="flex justify-between items-center border-b-2 border-slate-100 pb-3">
              <div>
                <h4 className="font-black text-base text-slate-900">
                  Cập Nhật Công Ngày {editingCell.dayNum}/{month}
                </h4>
                <p className="text-sm text-blue-700 font-extrabold mt-0.5">
                  {editingCell.emp.ho_ten} ({editingCell.emp.ma_nv})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg border border-slate-200 hover:border-slate-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-slate-800 font-black mb-1.5">Trạng thái công nhật</label>
                <select
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                  className="w-full px-3.5 py-3 bg-slate-50 border-2 border-slate-300 rounded-xl outline-none font-bold text-slate-900 focus:border-blue-600"
                >
                  <option value="1">1 — Đủ công ngày (1.0)</option>
                  <option value="0.5">0.5 — Nửa ngày công (0.5)</option>
                  <option value="P">P — Nghỉ phép hưởng lương</option>
                  <option value="OT">OT — Làm thêm ngoài giờ</option>
                  <option value="1/OT">1/OT — Đủ công + Tăng ca</option>
                  <option value="L">L — Nghỉ lễ hưởng x3</option>
                  <option value="KP">KP — Nghỉ không phép</option>
                  <option value="">(Xóa bỏ bản ghi công)</option>
                </select>
              </div>

              {(selectedStatus === "OT" || selectedStatus === "1/OT") && (
                <div>
                  <label className="block text-slate-800 font-black mb-1.5">Số giờ tăng ca (OT)</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    step="0.5"
                    value={otHours}
                    onChange={e => setOtHours(Number(e.target.value))}
                    className="w-full px-3.5 py-3 bg-slate-50 border-2 border-slate-300 rounded-xl outline-none font-black text-indigo-800 focus:border-indigo-600"
                  />
                  <span className="text-xs text-slate-500 mt-1 block font-medium">Hệ số Luật Lao Động: Ngày thường 1.5x, Chủ nhật 2.0x, Lễ 3.0x</span>
                </div>
              )}

              {/* Nhập lý do điều chỉnh công bắt buộc theo kiểm toán */}
              <div>
                <label className="block text-slate-800 font-black mb-1.5">
                  Lý do điều chỉnh <span className="text-rose-600">* (Bắt buộc)</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={editReason}
                  onChange={e => {
                    setEditReason(e.target.value);
                    if (editError) setEditError("");
                  }}
                  placeholder="Ví dụ: Nhân viên công tác hiện trường, cập nhật bổ sung..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-300 rounded-xl outline-none font-semibold text-slate-900 resize-none text-sm focus:border-blue-600"
                />
              </div>

              {editError && (
                <div className="p-3 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-800 text-xs flex items-center gap-2 font-bold">
                  <AlertTriangle size={16} className="shrink-0 text-rose-600" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCell(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black rounded-xl border-2 border-slate-300 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSaveCellAttendance}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl border-2 border-blue-700 shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  <span>Lưu Thay Đổi</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Chốt / Mở Lại Kỳ Công */}
      {showLockModal && (
        <PeriodLockModal
          month={month}
          year={year}
          isCurrentlyLocked={isLocked}
          userRole={userRole}
          onClose={() => setShowLockModal(false)}
          onStatusChanged={(newLocked, lockReason) => {
            setInternalLocked(newLocked);
            if (onRecordAuditLog) {
              onRecordAuditLog(
                newLocked ? "Chốt kỳ công" : "Mở lại kỳ công",
                `${newLocked ? "Chốt sổ" : "Mở khóa"} kỳ chấm công tháng ${month}/${year}`,
                lockReason || (newLocked ? "Kế toán chốt số liệu công tính lương" : "Quản trị viên mở khóa kỳ công")
              );
            }
            if (onShowToast) {
              onShowToast(newLocked ? `Đã chốt sổ kỳ công tháng ${month}/${year} thành công!` : `Đã mở khóa kỳ công tháng ${month}/${year}!`, "success");
            }
            if (onRefresh) onRefresh();
          }}
        />
      )}

    </div>
  );
}
