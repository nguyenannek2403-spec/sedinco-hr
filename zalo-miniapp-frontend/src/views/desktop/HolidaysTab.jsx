import React, { useState, useEffect, useCallback, useRef } from "react";
import { Gift, Plus, Trash2, Calendar, RefreshCw, AlertCircle } from "lucide-react";
import { safeGet, safePost, safeDelete } from "../../utils/api";
import ConfirmDialog from "../../components/ConfirmDialog";
import { AppButton, AppModal, FormRow, StatusBadge, SkeletonList, EmptyState } from "../../components/ui";

export default function HolidaysTab({ showToast }) {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    start_date: "",
    end_date: "",
    multiplier: 3.0
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

  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (addInFlightRef.current) return;
    if (!form.name || !form.start_date || !form.end_date) {
      if (showToast) showToast("Vui lòng nhập đầy đủ tên và ngày nghỉ lễ.", "error");
      return;
    }

    addInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const res = await safePost("/holidays", {
        ...form,
        holiday_name: form.name
      });
      if (res?.success) {
        if (showToast) showToast(`Đã thêm ngày lễ "${form.name}"!`, "success");
        setIsAddOpen(false);
        setForm({ name: "", start_date: "", end_date: "", multiplier: 3.0 });
        fetchHolidays();
      } else {
        if (showToast) showToast(res?.message || "Không thể thêm ngày lễ.", "error");
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
    <div className="space-y-4 max-w-4xl pb-28">
      {/* Header — Google Stitch Sedinco Pulse Holiday Multiplier Hub */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FFE4E6] dark:bg-rose-950/70 text-[#B80035] dark:text-rose-300 text-xs font-extrabold uppercase tracking-wider mb-1">
            <span>● SEDINCO HOLIDAYS &amp; OT MULTIPLIER (3,0X)</span>
          </span>
          <h2 className="text-lg font-extrabold leading-snug text-[#111C2D] dark:text-white flex items-center gap-2">
            <Gift className="w-5 h-5 text-[#E11D48] dark:text-rose-400 shrink-0" />
            <span>Danh mục lịch nghỉ lễ quốc gia</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">
            Ngày nghỉ lễ hưởng nguyên lương (1,0 công) và nhân hệ số 3,0x khi tăng ca (OT)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AppButton
            variant="danger"
            icon={Plus}
            onClick={() => setIsAddOpen(true)}
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
          <div className="overflow-x-auto touch-scroll-x">
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
                    <td className="p-3.5 whitespace-nowrap">
                      <StatusBadge
                        type="attendance"
                        status="L"
                        labelOverride={`Nghỉ lễ x${h.multiplier || 3.0}`}
                      />
                    </td>
                    <td className="p-3.5 text-right pr-5 whitespace-nowrap">
                      <AppButton
                        variant="ghost"
                        icon={Trash2}
                        onClick={() => handleDeleteHoliday(h.id, h.holiday_name || h.name)}
                        className="min-w-[44px] px-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/20"
                        title="Xóa"
                        aria-label={`Xóa ngày lễ ${h.holiday_name || h.name}`}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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

      {/* Modal Add Holiday */}
      <AppModal
        open={isAddOpen}
        onClose={() => !isSubmitting && setIsAddOpen(false)}
        disableClose={isSubmitting}
        title="Thêm dịp nghỉ lễ"
        subtitle="Thiết lập ngày lễ hưởng nguyên lương (3.0x khi OT)"
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
        <form id="add-holiday-form" onSubmit={handleAddHoliday} className="p-5 space-y-3">
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
        </form>
      </AppModal>
    </div>
  );
}
