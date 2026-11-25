import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Gift,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  Check,
  X,
  Loader2,
  Search
} from "lucide-react";
import { safeGet, safePost, safePut, safeDelete } from "../../utils/api";
import { formatViNumber } from "../../utils/viNumberFormat";
import ConfirmDialog from "../../components/ConfirmDialog";
import { SkeletonList, EmptyState } from "../../components/ui";

const MULTIPLIER_PRESETS = [
  { value: 1.5, label: "x1,5" },
  { value: 2.0, label: "x2" },
  { value: 3.0, label: "x3" }
];

const COMPACT_INPUT_CLASS =
  "w-full h-[40px] min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[14px] font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none";

const INPUT_PAIRED_BTN_BASE =
  "w-fit h-[40px] min-h-[40px] px-3.5 text-[13.5px] font-semibold rounded-lg whitespace-nowrap inline-flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-60 shrink-0";

const ROW_ACTION_BTN_BASE =
  "w-fit h-[32px] min-h-[32px] px-2.5 text-[12.5px] font-semibold rounded-lg whitespace-nowrap inline-flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer disabled:opacity-60 shrink-0";

function parseMultiplierInput(raw) {
  if (raw === undefined || raw === null) return NaN;
  const cleaned = String(raw).trim().replace(/^x/i, "").replace(",", ".");
  if (!cleaned) return NaN;
  return Number(cleaned);
}

function formatMultiplierValue(raw) {
  const num = parseMultiplierInput(raw);
  const safe = Number.isFinite(num) && num >= 1 ? Math.round(num * 100) / 100 : 3.0;
  return formatViNumber(safe, 2);
}

function formatDateDdMmYyyy(isoStr) {
  if (!isoStr) return "";
  const clean = String(isoStr).slice(0, 10);
  const parts = clean.split("-");
  if (parts.length !== 3) return clean;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function SmartAccordion({
  id,
  title,
  summary,
  icon: Icon,
  iconColor = "text-[#E11D48] dark:text-rose-300",
  iconBg = "bg-[#FFE4E6] dark:bg-rose-950/60",
  isOpen,
  isDirty = false,
  onToggle,
  children
}) {
  return (
    <div
      data-testid={`holidays-accordion-${id}`}
      data-open={isOpen ? "true" : "false"}
      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/85 dark:border-slate-800 shadow-xs overflow-hidden transition-all"
    >
      <button
        type="button"
        data-testid={`holidays-accordion-header-${id}`}
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-2.5 py-3 px-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className={`w-8 h-8 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center shrink-0`}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 leading-tight truncate">
              {title}
            </h3>
            <p
              data-testid={`holidays-accordion-summary-${id}`}
              className="text-[12px] text-slate-500 dark:text-slate-400 truncate mt-0.5 leading-snug"
            >
              {summary}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isDirty && (
            <span
              data-testid={`unsaved-badge-${id}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-[11px] font-semibold whitespace-nowrap"
            >
              ● Chưa lưu
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 shrink-0 ${
              isOpen ? "rotate-180" : "rotate-0"
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="px-3.5 pb-3.5 pt-2.5 sm:px-4 sm:pb-4 sm:pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

export default function HolidaysTab({ showToast }) {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingHolidayId, setEditingHolidayId] = useState(null);
  const [selectedYear, setSelectedYear] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
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

  // Khối 2 (Danh sách ngày nghỉ lễ) mặc định mở sẵn để Quản trị viên xem ngay
  const [openSections, setOpenSections] = useState({
    holiday_form: false,
    holiday_list: true
  });

  const toggleSection = useCallback((id) => {
    const isMobileViewport =
      typeof window !== "undefined" && Number(window.innerWidth) < 768;
    setOpenSections((prev) => {
      const nextState = !prev[id];
      if (isMobileViewport) {
        return {
          holiday_form: false,
          holiday_list: false,
          [id]: nextState
        };
      }
      return {
        ...prev,
        [id]: nextState
      };
    });
  }, []);

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

  const handleResetForm = () => {
    setEditingHolidayId(null);
    setForm({ name: "", start_date: "", end_date: "", salary_multiplier: "3" });
  };

  const handleOpenEdit = (h) => {
    setEditingHolidayId(h.id);
    const mult = Number(h.salary_multiplier ?? h.multiplier ?? 3.0) || 3.0;
    const startStr = String(h.start_date || "").slice(0, 10);
    const endStr = String(h.end_date || h.start_date || "").slice(0, 10);
    setForm({
      name: h.holiday_name || h.name || "",
      start_date: startStr,
      end_date: endStr,
      salary_multiplier: formatMultiplierValue(mult)
    });
    const isMobileViewport =
      typeof window !== "undefined" && Number(window.innerWidth) < 768;
    setOpenSections((prev) =>
      isMobileViewport
        ? { holiday_form: true, holiday_list: false }
        : { ...prev, holiday_form: true }
    );
  };

  const handleSaveHoliday = async (e) => {
    e.preventDefault();
    if (addInFlightRef.current) return;
    const effectiveEndDate = form.end_date || form.start_date;
    if (!form.name || !form.start_date || !effectiveEndDate) {
      if (showToast) showToast("Vui lòng nhập đầy đủ tên và ngày nghỉ lễ.", "error");
      return;
    }
    const parsedMultiplier = parseMultiplierInput(form.salary_multiplier);
    if (!Number.isFinite(parsedMultiplier) || parsedMultiplier < 1 || parsedMultiplier > 10) {
      if (showToast)
        showToast("Hệ số lương ngày lễ phải nằm trong khoảng từ 1,0 đến 10,0!", "error");
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
        end_date: effectiveEndDate >= form.start_date ? effectiveEndDate : form.start_date,
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
        handleResetForm();
        setOpenSections((prev) => ({ ...prev, holiday_list: true }));
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
        if (editingHolidayId === confirmDelete.id) {
          handleResetForm();
        }
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

  const filteredHolidays = holidays.filter((h) => {
    const startYear = String(h.start_date || "").slice(0, 4);
    const matchesYear = selectedYear === "ALL" || startYear === String(selectedYear);
    const cleanQ = searchQuery.trim().toLowerCase();
    const matchesName =
      !cleanQ ||
      String(h.holiday_name || h.name || "")
        .toLowerCase()
        .includes(cleanQ) ||
      String(h.start_date || "").includes(cleanQ);
    return matchesYear && matchesName;
  });

  const isFormDirty = Boolean(
    editingHolidayId || String(form.name || "").trim() || String(form.start_date || "").trim()
  );

  const formTitle = editingHolidayId
    ? `Đang sửa: ${form.name || "Ngày lễ"}`
    : "Thêm / Chỉnh sửa ngày lễ";

  const formSummary = editingHolidayId
    ? `Đang chỉnh sửa • ${formatDateDdMmYyyy(form.start_date)} • Hệ số x${formatMultiplierValue(
        form.salary_multiplier
      )}`
    : "Thêm dịp nghỉ lễ mới • Hệ số mặc định x3";

  const displayYearLabel =
    selectedYear === "ALL"
      ? holidays[0]?.start_date
        ? String(holidays[0].start_date).slice(0, 4)
        : new Date().getFullYear()
      : selectedYear;

  const listSummary = `Năm ${displayYearLabel} • ${filteredHolidays.length} ngày nghỉ lễ hưởng nguyên lương`;

  return (
    <div className="max-w-3xl mx-auto pb-6 space-y-2.5 sm:space-y-3">
      {/* KHỐI ACCORDION 1: THÊM / CHỈNH SỬA NGÀY LỄ */}
      <SmartAccordion
        id="holiday_form"
        title={formTitle}
        summary={formSummary}
        icon={Plus}
        iconColor="text-[#E11D48] dark:text-rose-300"
        iconBg="bg-[#FFE4E6] dark:bg-rose-950/60"
        isOpen={openSections.holiday_form}
        isDirty={isFormDirty}
        onToggle={toggleSection}
      >
        <form id="add-holiday-form" onSubmit={handleSaveHoliday} className="space-y-2.5">
          {/* Hàng 1 (grid grid-cols-2 gap-2.5 items-end): Cột trái Ngày lễ (h-[40px]) | Cột phải Hệ số lương (h-[40px] có hậu tố x) */}
          <div className="grid grid-cols-2 gap-2.5 items-end">
            <div>
              <label className="block text-[12px] font-semibold text-slate-600 dark:text-slate-300 mb-1 truncate">
                Ngày lễ
              </label>
              <input
                type="date"
                required
                aria-label="Ngày lễ"
                value={form.start_date}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    start_date: val,
                    end_date: !prev.end_date || prev.end_date === prev.start_date || prev.end_date < val ? val : prev.end_date
                  }));
                }}
                className={COMPACT_INPUT_CLASS}
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-slate-600 dark:text-slate-300 mb-1 truncate">
                Hệ số lương
              </label>
              <div className="relative flex items-center w-full">
                <input
                  type="text"
                  inputMode="decimal"
                  data-testid="holiday-multiplier-input"
                  placeholder="3"
                  value={form.salary_multiplier}
                  onChange={(e) => setForm((prev) => ({ ...prev, salary_multiplier: e.target.value }))}
                  className={`${COMPACT_INPUT_CLASS} pr-8`}
                />
                <span className="pointer-events-none select-none absolute right-3 text-[12px] font-medium text-slate-500 dark:text-slate-400">
                  x
                </span>
              </div>
            </div>
          </div>

          {/* Hàng chọn nhanh hệ số: Dãy chip 1 chạm gọn gàng (h-[30px] px-3 text-[12.5px] font-semibold w-fit): x1,5, x2, x3 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-slate-500 dark:text-slate-400 mr-0.5">
                Chọn nhanh:
              </span>
              {MULTIPLIER_PRESETS.map((preset) => {
                const currentNum = parseMultiplierInput(form.salary_multiplier);
                const isSelected =
                  Number.isFinite(currentNum) && Math.abs(currentNum - preset.value) < 0.001;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    data-testid={`holiday-preset-${preset.value}`}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        salary_multiplier: formatMultiplierValue(preset.value)
                      }))
                    }
                    className={`w-fit h-[30px] min-h-[30px] px-3 text-[12.5px] font-semibold rounded-lg border transition cursor-pointer ${
                      isSelected
                        ? "bg-[#E11D48] text-white border-[#E11D48] shadow-xs"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-rose-400"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {form.start_date && (
              <div className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400">
                <span>Đến ngày:</span>
                <input
                  type="date"
                  aria-label="Đến ngày"
                  min={form.start_date}
                  value={form.end_date || form.start_date}
                  onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                  className="h-[30px] px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[12px] font-medium text-slate-700 dark:text-slate-200 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Hàng 2 (flex items-end gap-2): Ô nhập Tên dịp lễ (flex-1 h-[40px]) + nút [+ Thêm] (hoặc [Lưu] + [Hủy]) */}
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <label className="block text-[12px] font-semibold text-slate-600 dark:text-slate-300 mb-1 truncate">
                Tên dịp lễ
              </label>
              <input
                type="text"
                required
                placeholder="VD: Tết Dương Lịch, Giỗ Tổ Hùng Vương..."
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className={COMPACT_INPUT_CLASS}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              data-testid="submit-holiday-btn"
              className={`${INPUT_PAIRED_BTN_BASE} bg-[#E11D48] hover:bg-[#BE123C] text-white shadow-xs`}
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : editingHolidayId ? (
                <Check className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Plus className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{isSubmitting ? "Đang lưu..." : editingHolidayId ? "Lưu" : "+ Thêm"}</span>
            </button>

            {editingHolidayId && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleResetForm}
                className={`${INPUT_PAIRED_BTN_BASE} bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700`}
              >
                <X className="w-3.5 h-3.5 shrink-0" />
                <span>Hủy</span>
              </button>
            )}
          </div>
        </form>
      </SmartAccordion>

      {/* KHỐI ACCORDION 2: DANH SÁCH NGÀY NGHỈ LỄ (Mặc định mở sẵn) */}
      <SmartAccordion
        id="holiday_list"
        title="Danh sách ngày nghỉ lễ"
        summary={listSummary}
        icon={Gift}
        iconColor="text-[#E11D48] dark:text-rose-300"
        iconBg="bg-[#FFE4E6] dark:bg-rose-950/60"
        isOpen={openSections.holiday_list}
        isDirty={false}
        onToggle={toggleSection}
      >
        <div className="space-y-2.5">
          {/* Hàng lọc năm nhỏ gọn (h-[36px], chọn năm 2026-2030 + bộ tìm nhanh) nằm gọn trên 1 hàng */}
          <div className="flex items-center gap-2">
            <select
              aria-label="Lọc theo năm"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-fit h-[36px] min-h-[36px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[13px] font-semibold text-slate-800 dark:text-slate-100 focus:border-[#E11D48] focus:outline-none shrink-0"
            >
              <option value="ALL">Tất cả năm</option>
              <option value="2026">Năm 2026</option>
              <option value="2027">Năm 2027</option>
              <option value="2028">Năm 2028</option>
              <option value="2029">Năm 2029</option>
              <option value="2030">Năm 2030</option>
            </select>

            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên ngày lễ..."
                className="w-full h-[36px] min-h-[36px] pl-8 pr-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[13px] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#E11D48] focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={fetchHolidays}
              disabled={loading}
              aria-label="Làm mới danh sách ngày lễ"
              className="w-fit h-[36px] min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 inline-flex items-center justify-center shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {loading ? (
            <SkeletonList rows={3} label="Đang tải dữ liệu ngày lễ..." />
          ) : error ? (
            <div className="py-4 text-center text-rose-600 dark:text-rose-300 text-xs flex flex-col items-center justify-center gap-2">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={fetchHolidays}
                className={`${ROW_ACTION_BTN_BASE} bg-[#E11D48] text-white`}
              >
                Thử lại
              </button>
            </div>
          ) : filteredHolidays.length === 0 ? (
            <EmptyState
              icon={Gift}
              title="Chưa có ngày lễ nào khớp bộ lọc."
              description="Mở mục 'Thêm / Chỉnh sửa ngày lễ' phía trên để khai báo ngày nghỉ lễ mới."
            />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredHolidays.map((h) => {
                const multVal = Number(h.salary_multiplier ?? h.multiplier ?? 3.0) || 3.0;
                const multLabel = formatMultiplierValue(multVal);
                const startFormatted = formatDateDdMmYyyy(h.start_date);
                const endFormatted = formatDateDdMmYyyy(h.end_date);
                const dateLabel =
                  !h.end_date || h.start_date === h.end_date
                    ? startFormatted
                    : `${startFormatted} → ${endFormatted.slice(0, 5)}`;

                return (
                  <div
                    key={h.id}
                    className="py-2.5 flex items-center justify-between gap-2"
                  >
                    {/* Cột trái: Ngày (DD/MM/YYYY) gọn in đậm + Tên dịp lễ */}
                    <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
                      <span className="inline-flex items-center gap-1 text-[12.5px] font-bold font-mono text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0">
                        <Calendar className="w-3.5 h-3.5 text-[#E11D48] dark:text-rose-400 shrink-0" />
                        <span>{dateLabel}</span>
                      </span>
                      <span className="hidden sm:inline text-slate-300 dark:text-slate-600">•</span>
                      <span className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">
                        {h.holiday_name || h.name}
                      </span>
                    </div>

                    {/* Cột phải: Huy hiệu hệ số nhỏ gọn (x3, x1,5) + 2 nút Sửa & Xóa (w-fit h-[32px] px-2.5 text-[12.5px] font-semibold) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        data-testid={`holiday-multiplier-badge-${h.id}`}
                        className="inline-flex items-center px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 text-[#E11D48] dark:text-rose-300 text-[12px] font-bold whitespace-nowrap"
                      >
                        x{multLabel}
                      </span>

                      <button
                        type="button"
                        data-testid={`edit-holiday-btn-${h.id}`}
                        onClick={() => handleOpenEdit(h)}
                        aria-label={`Sửa ngày lễ ${h.holiday_name || h.name}`}
                        className={`${ROW_ACTION_BTN_BASE} bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700`}
                      >
                        <Pencil className="w-3 h-3 shrink-0" />
                        <span>Sửa</span>
                      </button>

                      <button
                        type="button"
                        data-testid={`delete-holiday-btn-${h.id}`}
                        onClick={() => handleDeleteHoliday(h.id, h.holiday_name || h.name)}
                        aria-label={`Xóa ngày lễ ${h.holiday_name || h.name}`}
                        className={`${ROW_ACTION_BTN_BASE} text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200/70 dark:border-rose-800/60`}
                      >
                        <Trash2 className="w-3 h-3 shrink-0" />
                        <span>Xóa</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SmartAccordion>

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
    </div>
  );
}
