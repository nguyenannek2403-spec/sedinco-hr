import React, { useState, useEffect, useCallback } from "react";
import { Gift, Plus, Trash2, Calendar, RefreshCw, AlertCircle } from "lucide-react";
import { safeGet, safePost, safeDelete } from "../../utils/api";

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
    if (!form.name || !form.start_date || !form.end_date) return;

    setIsSubmitting(true);
    try {
      const res = await safePost("/holidays", form);
      if (res?.success) {
        if (showToast) showToast(`Đã thêm ngày lễ "${form.name}"!`, "success");
        setIsAddOpen(false);
        setForm({ name: "", start_date: "", end_date: "", multiplier: 3.0 });
        fetchHolidays();
      } else {
        alert(res?.message || "Không thể thêm ngày lễ.");
      }
    } catch (err) {
      alert(err.message || "Lỗi kết nối.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteHoliday = async (id, name) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ngày lễ "${name}"?`)) return;

    try {
      const res = await safeDelete(`/holidays/${id}`);
      if (res?.success) {
        if (showToast) showToast(`Đã xóa ngày lễ "${name}"!`, "success");
        fetchHolidays();
      } else {
        alert(res?.message || "Không thể xóa ngày lễ.");
      }
    } catch (err) {
      alert(err.message || "Lỗi xóa ngày lễ.");
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 shadow-xl flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Gift className="w-5 h-5 text-rose-400" />
            Danh Mục Lịch Nghỉ Lễ Quốc Gia
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Ngày lễ được nhân hệ số lương 3.0x khi làm thêm giờ theo quy định
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsAddOpen(true)}
            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-rose-600/30 transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Ngày Lễ</span>
          </button>
          <button
            onClick={fetchHolidays}
            disabled={loading}
            className="p-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
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
              <thead className="bg-slate-900/80 border-b border-slate-700/80 text-slate-400 uppercase tracking-wider font-bold">
                <tr>
                  <th className="p-3.5 pl-5">Tên Dịp Lễ</th>
                  <th className="p-3.5">Từ Ngày</th>
                  <th className="p-3.5">Đến Ngày</th>
                  <th className="p-3.5">Hệ Số Lương</th>
                  <th className="p-3.5 text-right pr-5">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50 text-slate-300">
                {holidays.map(h => (
                  <tr key={h.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="p-3.5 pl-5 font-bold text-white flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-rose-400" />
                      {h.name}
                    </td>
                    <td className="p-3.5 font-mono text-slate-300">{h.start_date}</td>
                    <td className="p-3.5 font-mono text-slate-300">{h.end_date}</td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 font-bold rounded-md text-[11px]">
                        x{h.multiplier || 3.0}
                      </span>
                    </td>
                    <td className="p-3.5 text-right pr-5">
                      <button
                        onClick={() => handleDeleteHoliday(h.id, h.name)}
                        className="p-1.5 text-rose-400 hover:bg-rose-500/15 rounded-lg transition-colors"
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

      {/* Modal Add Holiday */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Gift className="w-5 h-5 text-rose-400" />
              Thêm Dịp Nghỉ Lễ Mới
            </h3>

            <form onSubmit={handleAddHoliday} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Tên Dịp Lễ</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Tết Dương Lịch"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Bắt Đầu</label>
                  <input
                    type="date"
                    required
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Kết Thúc</label>
                  <input
                    type="date"
                    required
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-xl transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? "Đang lưu..." : "Lưu Ngày Lễ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
