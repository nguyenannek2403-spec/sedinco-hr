import React, { useState, useEffect, useCallback, useRef } from "react";
import { Gift, Plus, Trash2, Calendar, RefreshCw, AlertCircle, X } from "lucide-react";
import { safeGet, safePost, safeDelete } from "../../utils/api";
import ConfirmDialog from "../../components/ConfirmDialog";

export default function HolidaysTab({ currentUser, showToast }) {
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

  return (
    <div className="space-y-4 max-w-4xl pb-28">
      {/* Header */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold leading-snug text-white flex items-center gap-2">
            <Gift className="w-5 h-5 text-rose-400 shrink-0" />
            Danh mục lịch nghỉ lễ quốc gia
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed mt-0.5">
            Ngày lễ được nhân hệ số lương 3.0x khi làm thêm giờ theo quy định
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="min-h-[42px] px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-rose-600/30 transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Thêm ngày lễ</span>
          </button>
          <button
            type="button"
            onClick={fetchHolidays}
            disabled={loading}
            aria-label="Làm mới"
            className="min-h-[42px] min-w-[42px] p-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors flex items-center justify-center shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-rose-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-rose-400" />
            Đang tải dữ liệu ngày lễ...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-rose-400 text-xs flex items-center justify-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        ) : holidays.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            Chưa có ngày lễ nào được thiết lập.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 border-b border-slate-700/80 text-slate-300 font-semibold">
                <tr>
                  <th className="p-3.5 pl-5 whitespace-nowrap">Tên dịp lễ</th>
                  <th className="p-3.5 whitespace-nowrap">Từ ngày</th>
                  <th className="p-3.5 whitespace-nowrap">Đến ngày</th>
                  <th className="p-3.5 whitespace-nowrap">Hệ số lương</th>
                  <th className="p-3.5 text-right pr-5 whitespace-nowrap">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50 text-slate-300">
                {holidays.map(h => (
                  <tr key={h.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="p-3.5 pl-5 font-semibold text-white flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{h.holiday_name || h.name}</span>
                    </td>
                    <td className="p-3.5 font-mono text-slate-300 whitespace-nowrap">{h.start_date}</td>
                    <td className="p-3.5 font-mono text-slate-300 whitespace-nowrap">{h.end_date}</td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span className="px-2.5 py-0.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 font-semibold rounded-md text-xs whitespace-nowrap">
                        x{h.multiplier || 3.0}
                      </span>
                    </td>
                    <td className="p-3.5 text-right pr-5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleDeleteHoliday(h.id, h.holiday_name || h.name)}
                        className="min-h-[38px] min-w-[38px] p-2 text-rose-400 hover:bg-rose-500/15 rounded-lg transition-colors inline-flex items-center justify-center"
                        title="Xóa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
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
        danger={true}
        loading={isDeleting}
        onCancel={() => {
          if (!isDeleting) setConfirmDelete({ open: false, id: null, name: "" });
        }}
        onConfirm={executeDeleteHoliday}
      />

      {/* Modal Add Holiday */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-sm max-h-[88vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-slate-700/80 shrink-0">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Gift className="w-5 h-5 text-rose-400" />
                Thêm Dịp Nghỉ Lễ Mới
              </h3>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center justify-center shrink-0"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              id="add-holiday-form"
              onSubmit={handleAddHoliday}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-5 space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Tên dịp lễ</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Tết Dương Lịch"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Bắt đầu</label>
                  <input
                    type="date"
                    required
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Kết thúc</label>
                  <input
                    type="date"
                    required
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>
            </form>

            <div
              className="px-5 py-3.5 border-t border-slate-700/80 bg-slate-800 shrink-0 flex gap-2.5"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
            >
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="flex-1 min-h-[44px] py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold rounded-xl transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                form="add-holiday-form"
                disabled={isSubmitting}
                className="flex-1 min-h-[44px] py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50 whitespace-nowrap"
              >
                {isSubmitting ? "Đang lưu..." : "Lưu ngày lễ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
