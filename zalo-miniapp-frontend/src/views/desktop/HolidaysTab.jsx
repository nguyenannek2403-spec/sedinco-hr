import React, { useState, useEffect, useCallback, useRef } from "react";
import { Gift, Plus, Pencil, Trash2, Calendar, RefreshCw, AlertCircle } from "lucide-react";
import { safeGet, safePost, safePut, safeDelete } from "../../utils/api";
import { formatViNumber } from "../../utils/viNumberFormat";
import ConfirmDialog from "../../components/ConfirmDialog";
import { AppButton, AppModal, FormRow, StatusBadge, SkeletonList, EmptyState } from "../../components/ui";

const MULTIPLIER_PRESETS = [
  { value: 1.5, label: "x1,5" },
  { value: 2.0, label: "x2" },
  { value: 3.0, label: "x3" }
];

function parseMultiplierInput(raw) {
  if (raw === undefined || raw === null) return NaN;
  const cleaned = String(raw).trim().replace(",", ".");
  if (!cleaned) return NaN;
  return Number(cleaned);
}

function formatMultiplierValue(raw) {
  const num = parseMultiplierInput(raw);
  const safe = Number.isFinite(num) && num >= 1 ? Math.round(num * 100) / 100 : 3.0;
  return formatViNumber(safe, 2);
}

export default function HolidaysTab({ showToast }) {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingHolidayId, setEditingHolidayId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    start_date: "",
    end_date: "",
    salary_multiplier: "3"
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, name: "" });
  const [isDeleting, setIsDeleting] = useState(false);
  const addInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await safeGet("/holidays");
      if (res?.success && Array.isArray(res.data)) {
        setHolidays(res.data);
      } else {
        setHolidays([]);
      }
    } catch (err) {
      setError(err.message || "Không thể tải danh sách ngày lễ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  const handleOpenAdd = () => {
    setEditingHolidayId(null);
    setForm({ name: "", start_date: "", end_date: "", salary_multiplier: "3" });
    setIsAddOpen(true);
  };

  const handleOpenEdit = (h) => {
    setEditingHolidayId(h.id);
    const mult = Number(h.salary_multiplier ?? h.multiplier ?? 3.0) || 3.0;
    setForm({
      name: h.holiday_name || h.name || "",
      start_date: String(h.start_date || "").slice(0, 10),
      end_date: String(h.end_date || h.start_date || "").slice(0, 10),
      salary_multiplier: formatMultiplierValue(mult)
    });
    setIsAddOpen(true);
  };

  const handleSaveHoliday = async (e) => {
    e.preventDefault();
    if (addInFlightRef.current) return;
    if (!form.name || !form.start_date || !form.end_date) {
      if (showToast) showToast("Vui lòng nhập đầy đủ tên và ngày nghỉ lễ.", "error");
      return;
    }
    const parsedMultiplier = parseMultiplierInput(form.salary_multiplier);
    if (!Number.isFinite(parsedMultiplier) || parsedMultiplier < 1 || parsedMultiplier > 10) {
      if (showToast) showToast("Hệ số lương ngày lễ phải nằm trong khoảng từ 1,0 đến 10,0!", "error");
      return;
    }
    const cleanMultiplier = Math.round(parsedMultiplier * 100) / 100;

    addInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const payload = {
        name: String(form.name).trim(),
        holiday_name: String(form.name).trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        salary_multiplier: cleanMultiplier
      };
      const res = editingHolidayId
        ? await safePut(`/holidays/${editingHolidayId}`, payload)
        : await safePost("/holidays", payload);
      if (res?.success) {
        if (showToast) {
          showToast(
            editingHolidayId
              ? `Đã cập nhật ngày lễ "${form.name}" (x${formatMultiplierValue(cleanMultiplier)})!`
              : `Đã thêm ngày lễ "${form.name}" (x${formatMultiplierValue(cleanMultiplier)})!`,
            "success"
          );
        }
        setIsAddOpen(false);
        setEditingHolidayId(null);
        setForm({ name: "", start_date: "", end_date: "", salary_multiplier: "3" });
        fetchHolidays();
      } else {
        if (showToast) showToast(res?.message || "Không thể lưu ngày lễ.", "error");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Lỗi kết nối.", "error");
    } finally {
      addInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleDeleteHoliday = (id, name) => {
    setConfirmDelete({ open: true, id, name: name || "ngày lễ này" });
  };

  const executeDeleteHoliday = async () => {
    if (deleteInFlightRef.current || !confirmDelete.id) return;
    deleteInFlightRef.current = true;
    setIsDeleting(true);
    try {
      const res = await safeDelete(`/holidays/${confirmDelete.id}`);
      if (res?.success) {
        if (showToast) showToast(`Đã xóa ngày lễ "${confirmDelete.name}"!`, "success");
        setConfirmDelete({ open: false, id: null, name: "" });
        fetchHolidays();
      } else {
        if (showToast) showToast(res?.message || "Không thể xóa ngày lễ.", "error");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Lỗi xóa ngày lễ.", "error");
    } finally {
      deleteInFlightRef.current = false;
      setIsDeleting(false);
    }
  };

  const getHolidayDaysCount = (startStr, endStr) => {
    if (!startStr || !endStr) return 1;
    const s = new Date(`${String(startStr).slice(0, 10)}T00:00:00`);
    const e = new Date(`${String(endStr).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 1;
    return Math.round((e - s) / 86400000) + 1;
  };

  return (
    <div className="space-y-4 max-w-4xl pb-6">
      {/* Header — Google Stitch Sedinco Pulse Holiday Multiplier Hub */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FFE4E6] dark:bg-rose-950/70 text-[#B80035] dark:text-rose-300 text-xs font-extrabold uppercase tracking-wider mb-1">
            <span>● LỊCH NGHỈ LỄ &amp; HỆ SỐ LƯƠNG TÙY CHỈNH</span>
          </span>
          <h2 className="text-lg font-extrabold leading-snug text-[#111C2D] dark:text-white flex items-center gap-2">
            <Gift className="w-5 h-5 text-[#E11D48] dark:text-rose-400 shrink-0" />
            <span>Danh mục lịch nghỉ lễ quốc gia</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">
            Nghỉ lễ hưởng nguyên lương (1,0 công) và nhân hệ số tùy chỉnh (x1,5 • x2 • x3...) khi đi làm
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AppButton
            variant="danger"
            icon={Plus}
            onClick={handleOpenAdd}
            className="text-xs shadow-lg shadow-rose-600/25"
          >
            Thêm ngày lễ
          </AppButton>
          <AppButton
            variant="secondary"
            icon={RefreshCw}
            loading={loading}
            onClick={fetchHolidays}
            aria-label="Làm mới"
            className="min-w-[44px] px-3"
          />
        </div>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm dark:shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-4">
            <SkeletonList rows={3} label="Đang tải dữ liệu ngày lễ..." />
          </div>
        ) : error ? (
          <div className="p-6 text-center text-rose-600 dark:text-rose-300 text-xs flex flex-col items-center justify-center gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
            <AppButton variant="danger" onClick={fetchHolidays} className="text-xs px-4 py-2">
              Thử lại
            </AppButton>
          </div>
        ) : holidays.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Gift}
              title="Chưa có ngày lễ nào được thiết lập."
              description="Bấm 'Thêm ngày lễ' để khai báo ngày nghỉ lễ hưởng nguyên lương và nhân hệ số tăng ca."
            />
          </div>
        ) : (
          <>
            {/* Mobile Card List (< 768px) — Hiển thị rõ ràng trên màn 320px-430px không cần cuộn ngang */}
            <div className="md:hidden divide-y divide-slate-200/80 dark:divide-slate-800">
              {holidays.map((h) => {
                const daysCount = getHolidayDaysCount(h.start_date, h.end_date);
                const multVal = Number(h.salary_multiplier ?? h.multiplier ?? 3.0) || 3.0;
                const multLabel = formatMultiplierValue(multVal);
                return (
                  <div key={h.id} className="p-3.5 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <Calendar className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="font-extrabold text-sm text-[#111C2D] dark:text-white leading-snug break-words">
                            {h.holiday_name || h.name}
                          </div>
                          <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                            {h.start_date === h.end_date ? h.start_date : `${h.start_date} → ${h.end_date}`}
                          </div>
                        </div>
                      </div>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-[#E11D48] dark:text-rose-300 font-bold text-xs shrink-0">
                        {daysCount} ngày
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div data-testid={`holiday-multiplier-mobile-${h.id}`}>
                        <StatusBadge
                          type="attendance"
                          status="L"
                          labelOverride={`Đi làm: x${multLabel}`}
                        />
                      </div>
                      <div className="inline-flex items-center gap-1.5">
                        <AppButton
                          variant="secondary"
                          icon={Pencil}
                          onClick={() => handleOpenEdit(h)}
                          className="min-h-[40px] px-3 py-1.5 text-xs"
                          aria-label={`Sửa ngày lễ ${h.holiday_name || h.name}`}
                        >
                          Sửa
                        </AppButton>
                        <AppButton
                          variant="ghost"
                          icon={Trash2}
                          onClick={() => handleDeleteHoliday(h.id, h.holiday_name || h.name)}
                          className="min-w-[40px] min-h-[40px] px-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/20"
                          aria-label={`Xóa ngày lễ ${h.holiday_name || h.name}`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tablet & Desktop Table (>= 768px) */}
            <div className="hidden md:block overflow-x-auto touch-scroll-x">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="bg-[#F0F3FF] dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                  <tr>
                    <th className="p-3.5 pl-5 min-w-[200px] whitespace-nowrap">Tên dịp lễ</th>
                    <th className="p-3.5 whitespace-nowrap">Từ ngày</th>
                    <th className="p-3.5 whitespace-nowrap">Đến ngày</th>
                    <th className="p-3.5 whitespace-nowrap">Số ngày</th>
                    <th className="p-3.5 whitespace-nowrap">Hệ số lương</th>
                    <th className="p-3.5 text-right pr-5 whitespace-nowrap">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                  {holidays.map((h) => {
                    const daysCount = getHolidayDaysCount(h.start_date, h.end_date);
                    const multVal = Number(h.salary_multiplier ?? h.multiplier ?? 3.0) || 3.0;
                    const multLabel = formatMultiplierValue(multVal);
                    return (
                    <tr key={h.id} className="perf-list-item hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                      <td className="p-3.5 pl-5 min-w-[200px] font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
                        <span>{h.holiday_name || h.name}</span>
                      </td>
                      <td className="p-3.5 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">{h.start_date}</td>
                      <td className="p-3.5 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">{h.end_date}</td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-[#E11D48] dark:text-rose-300 font-bold text-xs">
                          {daysCount} ngày
                        </span>
                      </td>
                      <td className="p-3.5 whitespace-nowrap" data-testid={`holiday-multiplier-badge-${h.id}`}>
                        <StatusBadge
                          type="attendance"
                          status="L"
                          labelOverride={`Đi làm: x${multLabel}`}
                        />
                      </td>
                      <td className="p-3.5 text-right pr-5 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <AppButton
                            variant="ghost"
                            icon={Pencil}
                            data-testid={`edit-holiday-btn-${h.id}`}
                            onClick={() => handleOpenEdit(h)}
                            className="min-w-[44px] px-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Sửa ngày lễ"
                            aria-label={`Sửa ngày lễ ${h.holiday_name || h.name}`}
                          >
                            Sửa
                          </AppButton>
                          <AppButton
                            variant="ghost"
                            icon={Trash2}
                            data-testid={`delete-holiday-btn-${h.id}`}
                            onClick={() => handleDeleteHoliday(h.id, h.holiday_name || h.name)}
                            className="min-w-[44px] px-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/20"
                            title="Xóa"
                            aria-label={`Xóa ngày lễ ${h.holiday_name || h.name}`}
                          />
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete.open}
        title="Xác nhận xóa ngày lễ"
        message={`Bạn có chắc chắn muốn xóa ngày lễ "${confirmDelete.name}" khỏi danh mục lịch nghỉ lễ?`}
        confirmLabel="Xóa ngày lễ"
        variant="danger"
        loading={isDeleting}
        onCancel={() => {
          if (!isDeleting) setConfirmDelete({ open: false, id: null, name: "" });
        }}
        onConfirm={executeDeleteHoliday}
      />

      {/* Modal Add / Edit Holiday */}
      <AppModal
        open={isAddOpen}
        onClose={() => !isSubmitting && setIsAddOpen(false)}
        disableClose={isSubmitting}
        title={editingHolidayId ? "Cập nhật dịp nghỉ lễ" : "Thêm dịp nghỉ lễ"}
        subtitle="Thiết lập ngày nghỉ lễ & hệ số lương khi đi làm"
        icon={<Gift className="w-5 h-5 text-rose-500 dark:text-rose-400" />}
        maxWidthClass="max-w-sm"
        footer={
          <div className="flex gap-2.5">
            <AppButton
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => setIsAddOpen(false)}
              className="flex-1"
            >
              Đóng / Quay lại
            </AppButton>
            <AppButton
              type="submit"
              form="add-holiday-form"
              variant="danger"
              loading={isSubmitting}
              loadingText="Đang lưu..."
              className="flex-1"
            >
              Lưu ngày lễ
            </AppButton>
          </div>
        }
      >
        <form id="add-holiday-form" onSubmit={handleSaveHoliday} className="p-5 space-y-3">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Tên dịp lễ</label>
            <input
              type="text"
              required
              placeholder="Ví dụ: Tết Dương Lịch"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800/70 overflow-hidden">
            <FormRow label="Từ ngày">
              <input
                type="date"
                required
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-36 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-2 text-base font-semibold text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </FormRow>
            <FormRow label="Đến ngày">
              <input
                type="date"
                required
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-36 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-2 text-base font-semibold text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </FormRow>
          </div>

          <div className="space-y-2 pt-1">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Hệ số lương khi đi làm ngày lễ
            </label>
            <div className="grid grid-cols-3 gap-2">
              {MULTIPLIER_PRESETS.map((preset) => {
                const currentNum = parseMultiplierInput(form.salary_multiplier);
                const isSelected = Number.isFinite(currentNum) && Math.abs(currentNum - preset.value) < 0.001;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    data-testid={`holiday-preset-${preset.value}`}
                    onClick={() => setForm({ ...form, salary_multiplier: formatMultiplierValue(preset.value) })}
                    className={`min-h-[44px] px-3 rounded-xl text-sm font-extrabold border transition cursor-pointer ${
                      isSelected
                        ? "bg-[#E11D48] text-white border-[#E11D48] shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:border-rose-400"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                Hoặc tự nhập (x):
              </span>
              <input
                type="text"
                inputMode="decimal"
                data-testid="holiday-multiplier-input"
                placeholder="VD: 1,5 hoặc 2,5"
                value={form.salary_multiplier}
                onChange={(e) => setForm({ ...form, salary_multiplier: e.target.value })}
                className="flex-1 min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-base font-bold text-slate-900 dark:text-white text-right focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Ví dụ: Hệ số <strong>x1,5</strong> trả thêm <strong>0,5x</strong> khi đi làm (tổng 1,5x); <strong>x3</strong> trả thêm <strong>2,0x</strong> (tổng 3x).
            </p>
          </div>
        </form>
      </AppModal>
    </div>
  );
}
