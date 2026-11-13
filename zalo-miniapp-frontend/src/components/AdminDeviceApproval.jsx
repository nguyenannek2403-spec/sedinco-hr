import React, { useState, useEffect, useRef, useCallback } from "react";
import { Check, X, ShieldCheck, RefreshCw, Loader2 } from "lucide-react";
import { safeGet, safePost, generateIdempotencyKey } from "../utils/api";
import ConfirmDialog from "./ConfirmDialog";

/**
 * Màn hình Admin quản lý, phê duyệt hoặc từ chối yêu cầu đổi thiết bị chấm công
 */
export default function AdminDeviceApproval({ currentUser, showToast }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [message, setMessage] = useState("");
  const [pendingReject, setPendingReject] = useState(null);
  const actionLockRef = useRef(false);

  const notify = useCallback(
    (msg, type = "info") => {
      setMessage(msg);
      if (showToast) showToast(msg, type);
    },
    [showToast]
  );

  const fetchPendingRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await safeGet("/employees/pending-device-changes", {}, { cancelPrevious: true });
      if (data?.success && Array.isArray(data.data)) {
        setRequests(data.data.filter((e) => Boolean(e.pending_device_id)));
      } else {
        setRequests([]);
      }
    } catch (err) {
      notify(err?.message || "Lỗi khi tải danh sách yêu cầu đổi thiết bị.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (currentUser?.role === "admin") {
      fetchPendingRequests();
    }
  }, [currentUser?.role, fetchPendingRequests]);

  const handleApprove = async (ma_nv) => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setActionLoading(ma_nv);
    setMessage("");
    try {
      const data = await safePost(
        `/employees/${ma_nv}/approve-device-change`,
        {},
        { idempotencyKey: generateIdempotencyKey("approve_dev") }
      );
      if (data?.success) {
        notify(`Đã phê duyệt cập nhật thiết bị mới cho nhân viên ${ma_nv}!`, "success");
        fetchPendingRequests();
      } else {
        notify(data?.message || "Không thể phê duyệt yêu cầu đổi thiết bị.", "error");
      }
    } catch (err) {
      notify(err?.message || "Lỗi kết nối khi gửi lệnh phê duyệt.", "error");
    } finally {
      actionLockRef.current = false;
      setActionLoading(null);
    }
  };

  const executeReject = async (ma_nv) => {
    if (actionLockRef.current || !ma_nv) return;
    actionLockRef.current = true;
    setActionLoading(ma_nv);
    setMessage("");
    try {
      const data = await safePost(
        `/employees/${ma_nv}/reject-device-change`,
        {},
        { idempotencyKey: generateIdempotencyKey("reject_dev") }
      );
      if (data?.success) {
        notify(`Đã từ chối yêu cầu đổi thiết bị của nhân viên ${ma_nv}.`, "info");
        setPendingReject(null);
        fetchPendingRequests();
      } else {
        notify(data?.message || "Không thể từ chối yêu cầu đổi thiết bị.", "error");
      }
    } catch (err) {
      notify(err?.message || "Lỗi kết nối khi từ chối yêu cầu.", "error");
    } finally {
      actionLockRef.current = false;
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-4 pb-28">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <ShieldCheck size={22} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-base leading-snug">
                Phê duyệt đổi thiết bị chấm công
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Chỉ Quản trị viên mới có thẩm quyền xác nhận thiết bị mới của công nhân.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={fetchPendingRequests}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-blue-600" : ""} />
            <span>Làm mới</span>
          </button>
        </div>

        {message && (
          <div className="p-3 rounded-xl text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200">
            {message}
          </div>
        )}

        {loading && requests.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span>Đang kiểm tra danh sách chờ duyệt...</span>
          </div>
        ) : requests.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-sm">
            Hiện không có yêu cầu đổi thiết bị nào đang chờ duyệt.
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => {
              const busy = actionLoading === req.ma_nv;
              return (
                <div
                  key={req.ma_nv}
                  className="p-4 border border-slate-200 rounded-2xl flex flex-col gap-3 bg-slate-50/70"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{req.ho_ten}</span>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-mono font-semibold">
                          {req.ma_nv}
                        </span>
                      </div>
                      {req.chuc_danh && (
                        <p className="text-xs text-slate-500 mt-0.5">{req.chuc_danh}</p>
                      )}
                    </div>
                    <span className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-lg font-medium whitespace-nowrap shrink-0">
                      Chờ duyệt
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1 bg-white p-3 rounded-xl border border-slate-200">
                    <p className="break-all">
                      <strong>Thiết bị cũ:</strong> {req.bound_device_id || "Chưa gắn kết"}
                    </p>
                    <p className="break-all">
                      <strong>Thiết bị mới:</strong>{" "}
                      <span className="font-mono text-blue-700">{req.pending_device_id}</span>
                    </p>
                    <p>
                      <strong>Lý do:</strong> <em>"{req.device_change_reason || "Không ghi rõ"}"</em>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={busy || actionLoading !== null}
                      onClick={() => setPendingReject(req)}
                      className="min-h-[44px] px-3 py-2 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                    >
                      <X size={15} />
                      <span>Từ chối</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || actionLoading !== null}
                      onClick={() => handleApprove(req.ma_nv)}
                      className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                      <span>{busy ? "Đang xử lý..." : "Phê duyệt"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingReject)}
        title="Từ chối đổi thiết bị"
        message={
          pendingReject
            ? `Xác nhận từ chối yêu cầu đổi sang thiết bị mới của ${pendingReject.ho_ten} (${pendingReject.ma_nv})?`
            : ""
        }
        confirmLabel="Từ chối yêu cầu"
        variant="danger"
        loading={actionLoading === pendingReject?.ma_nv}
        onCancel={() => setPendingReject(null)}
        onConfirm={() => executeReject(pendingReject?.ma_nv)}
      />
    </div>
  );
}
