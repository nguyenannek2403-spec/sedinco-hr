import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Play,
  Download,
  RefreshCw,
  Bug,
  Layers,
  History,
  Lock
} from "lucide-react";
import { safeGet, safePost } from "../../utils/api";
import { zmpAdapter } from "../../adapters/zmp/sdkAdapter";
import { AppButton, SkeletonList } from "../../components/ui";

const STATUS_STYLES = {
  PASS: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700",
  FAIL: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-700",
  BLOCKED: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700",
  "NOT TESTED": "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
  SKIPPED: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
  OPEN: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-700",
  FIXED: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-700",
  VERIFIED: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700"
};

/**
 * QA Center — Trung tâm Kiểm thử Chất lượng Hệ thống (Dành riêng cho Admin):
 * - Đọc số liệu thật từ Backend (/api/qa-center/*), không tự sinh số liệu giả
 * - Quản lý 8 nhóm test case, Bug Registry, Lịch sử & Chạy kiểm tra Runtime an toàn
 */
export default function QaCenterTab({ showToast }) {
  const [subView, setSubView] = useState("overview"); // 'overview' | 'cases' | 'bugs' | 'history'
  const [loading, setLoading] = useState(true);
  const [runningSafe, setRunningSafe] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [overview, setOverview] = useState(null);
  const [testCasesData, setTestCasesData] = useState({ items: [], groups: [], modules: [] });
  const [bugsData, setBugsData] = useState({ items: [] });
  const [historyData, setHistoryData] = useState({ runs: [], version_history: [], module_bug_hotspots: [] });
  const [lastSafeResult, setLastSafeResult] = useState(null);

  const [groupFilter, setGroupFilter] = useState("ALL");
  const [moduleFilter, setModuleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [bugSeverityFilter, setBugSeverityFilter] = useState("ALL");

  const loadAllQaData = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, tcRes, bugRes, histRes] = await Promise.all([
        safeGet("/qa-center/overview", {}, { cancelPrevious: false }),
        safeGet("/qa-center/test-cases", { group: groupFilter, module: moduleFilter, status: statusFilter }, { cancelPrevious: false }),
        safeGet("/qa-center/bugs", { severity: bugSeverityFilter }, { cancelPrevious: false }),
        safeGet("/qa-center/history", {}, { cancelPrevious: false })
      ]);
      if (ovRes?.success) setOverview(ovRes.data);
      if (tcRes?.success) setTestCasesData(tcRes.data || { items: [], groups: [], modules: [] });
      if (bugRes?.success) setBugsData(bugRes.data || { items: [] });
      if (histRes?.success) setHistoryData(histRes.data || { runs: [], version_history: [], module_bug_hotspots: [] });
    } catch (err) {
      if (showToast) showToast(err?.message || "Không thể tải dữ liệu QA Center.", "error");
    } finally {
      setLoading(false);
    }
  }, [groupFilter, moduleFilter, statusFilter, bugSeverityFilter, showToast]);

  useEffect(() => {
    loadAllQaData();
  }, [loadAllQaData]);

  const handleRunSafeChecks = async () => {
    setRunningSafe(true);
    try {
      const res = await safePost("/qa-center/run-safe-checks", {
        requestedMode: "safe",
        checks: ["db_integrity", "rbac_matrix", "notification_lifecycle", "route_inventory", "architecture_health"]
      });
      if (res?.success && res.data) {
        setLastSafeResult(res.data);
        if (showToast) {
          showToast(
            `Đã chạy ${res.data.total_cases} kiểm tra an toàn: ${res.data.passed} PASS / ${res.data.failed} FAIL (${res.data.duration_ms}ms)`,
            res.data.failed === 0 ? "success" : "warning"
          );
        }
        await loadAllQaData();
      }
    } catch (err) {
      if (showToast) showToast(err?.message || "Chạy kiểm tra an toàn thất bại.", "error");
    } finally {
      setRunningSafe(false);
    }
  };

  const handleExportQaReport = async () => {
    setExporting(true);
    try {
      const res = await safeGet("/qa-center/export", {}, { cancelPrevious: false });
      if (res?.success && res.data) {
        await zmpAdapter.saveFile({
          filename: `SEDINCO_QA_Report_${overview?.version || "V29"}_${new Date().toISOString().slice(0, 10)}.json`,
          content: JSON.stringify(res.data, null, 2),
          mimeType: "application/json;charset=utf-8;"
        });
        if (showToast) showToast("Đã xuất báo cáo QA Center (JSON)!", "success");
      }
    } catch (err) {
      if (showToast) showToast(err?.message || "Không thể xuất báo cáo QA.", "error");
    } finally {
      setExporting(false);
    }
  };

  const perfSummary = overview?.performance_summary;

  return (
    <div data-testid="qa-center-tab" className="space-y-5 max-w-6xl mx-auto">
      {/* Header QA Center */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-700 text-[#0068FF] dark:text-blue-300 text-xs font-extrabold">
                <Activity size={13} />
                <span>QA Center • {overview?.version || "V29"}</span>
              </span>
              {overview?.readiness_status && (
                <span
                  data-testid="qa-readiness-badge"
                  className={`px-2.5 py-1 rounded-full border text-xs font-extrabold ${
                    overview.readiness_status === "READY FOR STAGING"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700"
                      : overview.readiness_status === "NOT READY"
                      ? "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-700"
                      : "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700"
                  }`}
                >
                  {overview.readiness_status}
                </span>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              Trung tâm Kiểm thử &amp; Giám sát Chất lượng Phần mềm
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Hiển thị kết quả xác thực từ bộ kiểm thử tự động, sổ quản lý lỗi thực tế và benchmark hiệu năng cục bộ.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <AppButton
              data-testid="qa-run-safe-checks-btn"
              variant="primary"
              icon={Play}
              loading={runningSafe}
              loadingText="Đang kiểm tra..."
              onClick={handleRunSafeChecks}
              className="text-xs sm:text-sm"
            >
              Chạy kiểm tra an toàn
            </AppButton>
            <AppButton
              data-testid="qa-export-report-btn"
              variant="secondary"
              icon={Download}
              loading={exporting}
              onClick={handleExportQaReport}
              className="text-xs sm:text-sm"
            >
              Xuất báo cáo
            </AppButton>
            <AppButton
              variant="ghost"
              icon={RefreshCw}
              loading={loading}
              onClick={loadAllQaData}
              aria-label="Tải lại QA Center"
              className="min-w-[44px]"
            />
          </div>
        </div>

        {/* Ghi chú chính sách an toàn */}
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200">
          <Lock size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <span>
            {overview?.safety_policy?.reason ||
              "Tác vụ stress test 50–200 CCU bị khóa trên giao diện web; chỉ chạy kiểm tra Runtime an toàn không ảnh hưởng dữ liệu thật."}
          </span>
        </div>

        {/* Segmented Tabs trong QA Center */}
        <div
          data-filter-group="qa-center-subtabs"
          className="flex flex-wrap gap-1.5 bg-slate-100 dark:bg-slate-950 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800"
        >
          {[
            { id: "overview", label: "Tổng quan & 8 Nhóm", Icon: ShieldCheck },
            { id: "cases", label: `Test Cases (${overview?.total_cases || 0})`, Icon: Layers },
            { id: "bugs", label: `Sổ Lỗi (${overview?.bugs_total || 0})`, Icon: Bug },
            { id: "history", label: `Lịch sử (${historyData?.runs?.length || 0})`, Icon: History }
          ].map(({ id, label, Icon }) => {
            const active = subView === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={`qa-subtab-${id}`}
                data-active={active ? "true" : "false"}
                onClick={() => setSubView(id)}
                className={`min-h-[44px] flex-1 min-w-[140px] px-3 py-2 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  active
                    ? "bg-[#0068FF] text-white dark:bg-blue-600 shadow-xs"
                    : "text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                }`}
              >
                <Icon size={15} className="shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Kết quả chạy Runtime Safe Checks gần nhất trong phiên */}
      {lastSafeResult && (
        <div
          data-testid="qa-safe-run-result"
          className="bg-white dark:bg-slate-900 border-2 border-blue-200 dark:border-blue-800 rounded-2xl p-4 shadow-sm space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-black text-slate-900 dark:text-white">
              Kết quả Kiểm tra Runtime An toàn ({lastSafeResult.passed}/{lastSafeResult.total_cases} PASS • {lastSafeResult.duration_ms}ms)
            </span>
            <span className="text-xs text-slate-600 dark:text-slate-300">
              Môi trường: {lastSafeResult.environment}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(lastSafeResult.checks || []).map((c) => (
              <div
                key={c.check_id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 flex items-start justify-between gap-2 text-xs"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white">
                    {c.check_id} • {c.name}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300 break-words">{c.actual}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full border font-bold shrink-0 ${STATUS_STYLES[c.status] || ""}`}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && !overview ? (
        <SkeletonList rows={4} label="Đang tải báo cáo QA Center..." />
      ) : (
        <>
          {/* VIEW 1: TỔNG QUAN & 8 NHÓM KIỂM THỬ */}
          {subView === "overview" && overview && (
            <div className="space-y-4">
              {/* KPI Grid Tổng quan */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300">Phân hệ đã kiểm</div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">
                    {overview.modules_tested} / {overview.total_modules}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300">Tỷ lệ PASS</div>
                  <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 font-mono mt-1">
                    {overview.pass_rate}%
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    {overview.passed} PASS / {overview.total_cases} cases
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300">FAIL / BLOCKED / CHƯA TEST</div>
                  <div className="text-lg font-black text-slate-900 dark:text-white font-mono mt-1">
                    <span className={overview.failed > 0 ? "text-rose-600 dark:text-rose-400" : ""}>{overview.failed}</span>
                    {" / "}
                    <span className={overview.blocked > 0 ? "text-amber-600 dark:text-amber-300" : ""}>{overview.blocked}</span>
                    {" / "}
                    <span>{overview.not_tested}</span>
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300">Lỗi tồn (C / H / M / L)</div>
                  <div className="text-lg font-black text-slate-900 dark:text-white font-mono mt-1">
                    {overview.bugs_by_severity?.Critical || 0} / {overview.bugs_by_severity?.High || 0} /{" "}
                    {overview.bugs_by_severity?.Medium || 0} / {overview.bugs_by_severity?.Low || 0}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    Đang mở: {overview.open_bugs_count}
                  </div>
                </div>
              </div>

              {/* 8 Nhóm Kiểm thử */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                  8 Nhóm Kiểm thử Trọng tâm (Nhóm A – Nhóm H)
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(overview.groups || []).map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => {
                        setGroupFilter(g.key);
                        setSubView("cases");
                      }}
                      className="text-left p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 hover:bg-blue-50/60 dark:bg-slate-800/70 dark:hover:bg-slate-800 transition-colors cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                          {g.code}. {g.name}
                        </span>
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                          {g.passed}/{g.total} PASS
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{g.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bao phủ theo Phân hệ & Hiệu năng */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    Chất lượng theo từng Phân hệ ({overview.modules?.length || 0})
                  </h2>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {(overview.modules || []).map((m) => (
                      <div key={m.id} className="py-2 flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800 dark:text-slate-100">{m.name}</span>
                        <div className="flex items-center gap-2 shrink-0 font-mono">
                          <span className="text-emerald-700 dark:text-emerald-300 font-bold">{m.passed} PASS</span>
                          {m.failed > 0 && <span className="text-rose-600 dark:text-rose-400 font-bold">{m.failed} FAIL</span>}
                          {m.open_bugs > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-700">
                              {m.open_bugs} lỗi mở
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    Chỉ số Hiệu năng Thực tế (Local Test DB)
                  </h2>
                  {perfSummary && Array.isArray(perfSummary.levels) ? (
                    <div className="space-y-2.5 text-xs">
                      <div className="text-slate-600 dark:text-slate-300">
                        Đo lúc: {perfSummary.measured_at ? new Date(perfSummary.measured_at).toLocaleString("vi-VN") : "—"} • Nguồn: {perfSummary.environment}
                      </div>
                      {perfSummary.levels.map((lv) => (
                        <div
                          key={lv.concurrency}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2"
                        >
                          <span className="font-extrabold text-slate-900 dark:text-white">
                            {lv.concurrency} CCU ({lv.total_requests} req)
                          </span>
                          <div className="flex flex-wrap gap-2 font-mono text-slate-700 dark:text-slate-200">
                            <span>P50: <strong>{lv.p50_ms}ms</strong></span>
                            <span>P95: <strong>{lv.p95_ms}ms</strong></span>
                            <span>P99: <strong>{lv.p99_ms}ms</strong></span>
                            <span>{lv.throughput_rps} req/s</span>
                            <span>Err: {lv.error_rate_pct}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 dark:text-slate-300 py-4">
                      {perfSummary?.note || "Chưa có dữ liệu benchmark hiệu năng."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 2: TEST CASES */}
          {subView === "cases" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Lọc theo nhóm kiểm thử"
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="ALL">Tất cả 8 Nhóm</option>
                  {(testCasesData.groups || []).map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.code}. {g.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Lọc theo phân hệ"
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value)}
                  className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="ALL">Tất cả Phân hệ</option>
                  {(testCasesData.modules || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Lọc theo trạng thái"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="ALL">Tất cả Trạng thái</option>
                  <option value="PASS">PASS</option>
                  <option value="FAIL">FAIL</option>
                  <option value="BLOCKED">BLOCKED</option>
                  <option value="NOT TESTED">NOT TESTED</option>
                </select>
              </div>

              {(testCasesData.items || []).length === 0 ? (
                <p className="text-xs text-slate-600 dark:text-slate-300 py-6 text-center">
                  Không có test case nào khớp bộ lọc hoặc chưa nạp file bằng chứng kiểm thử.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {(testCasesData.items || []).map((tc, i) => (
                    <div key={`${tc.test_id}-${i}`} className="py-3 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-bold text-slate-900 dark:text-white">
                          <span className="font-mono text-[#0068FF] dark:text-blue-300 mr-1.5">{tc.test_id}</span>
                          {tc.name}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-slate-600 dark:text-slate-300">{tc.duration_ms || 0}ms</span>
                          <span className={`px-2 py-0.5 rounded-full border font-bold ${STATUS_STYLES[tc.status] || ""}`}>
                            {tc.status}
                          </span>
                        </div>
                      </div>
                      <div className="text-slate-600 dark:text-slate-300 flex flex-wrap gap-3">
                        <span>Module: <strong>{tc.module}</strong></span>
                        <span>Nhóm: <strong>{tc.group_code}</strong></span>
                        <span>Phạm vi: <strong>{tc.execution_scope || "dev_ci_only"}</strong></span>
                        <span>Phiên bản: <strong>{tc.version || "V29"}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VIEW 3: SỔ LỖI */}
          {subView === "bugs" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {["ALL", "P0", "P1", "P2", "P3"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setBugSeverityFilter(p)}
                    className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                      bugSeverityFilter === p
                        ? "bg-[#0068FF] text-white border-blue-600"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {p === "ALL" ? "Tất cả mức độ" : p}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {(bugsData.items || []).map((b) => (
                  <div
                    key={b.bug_id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 space-y-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                        <span className="font-mono text-rose-700 dark:text-rose-300 mr-2">{b.bug_id}</span>
                        {b.title}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 font-bold">
                          {b.priority} • {b.severity}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full border font-bold ${STATUS_STYLES[b.status] || ""}`}>
                          {b.status}
                        </span>
                      </div>
                    </div>
                    <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{b.description}</p>
                    <div className="text-slate-600 dark:text-slate-300">
                      <strong>Nguyên nhân gốc:</strong> {b.root_cause}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600 dark:text-slate-300">
                      <span>Phân hệ: <strong>{b.module}</strong></span>
                      <span>Kiểm thử lại: <strong>{b.retest_result}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW 4: LỊCH SỬ & SO SÁNH PHIÊN BẢN */}
          {subView === "history" && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                  Lịch sử Chạy Kiểm thử Gần đây (Database `qa_test_runs`)
                </h2>
                {(historyData.runs || []).length === 0 ? (
                  <p className="text-xs text-slate-600 dark:text-slate-300 py-4">
                    Chưa có lượt chạy kiểm thử nào được lưu. Bấm &quot;Chạy kiểm tra an toàn&quot; để ghi nhận.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {historyData.runs.map((r) => (
                      <div key={r.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-900 dark:text-white">
                            #{r.id} • {r.version} • {r.run_type} ({r.environment})
                          </div>
                          <div className="text-slate-600 dark:text-slate-300">
                            {new Date(r.created_at).toLocaleString("vi-VN")} • Người chạy: {r.triggered_by}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-emerald-700 dark:text-emerald-300 font-bold">{r.passed} PASS</span>
                          <span className={r.failed > 0 ? "text-rose-600 font-bold" : "text-slate-600 dark:text-slate-300"}>
                            {r.failed} FAIL
                          </span>
                          <span className="text-slate-600 dark:text-slate-300">{r.duration_ms}ms</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(historyData.version_history || []).length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    So sánh Chất lượng qua Các Phiên bản
                  </h2>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {historyData.version_history.map((vh) => (
                      <div key={vh.version} className="py-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{vh.version} — {vh.summary}</span>
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                          {vh.passed}/{vh.total_cases} PASS
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
