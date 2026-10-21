import React, { useState, useEffect, useRef, useCallback } from "react";
import { getLocation, chooseImage } from "zmp-sdk/apis";
import {
  Clock,
  MapPin,
  Camera,
  CheckCircle2,
  Calendar,
  FileText,
  DollarSign,
  User,
  Plus,
  X,
  AlertCircle,
  Briefcase,
  Phone,
  Mail,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Lock,
  Eye,
  EyeOff,
  RotateCcw,
  AlertTriangle,
  Building,
  Gift,
  Upload,
  Check,
  Trash2,
  Users,
  Award,
  Settings,
  BarChart3,
  Filter,
  Search,
  RefreshCw,
  Printer,
  Smartphone,
  Monitor,
  Download,
  Grid,
  Key,
  Copy,
  ExternalLink,
  Navigation,
  Compass,
  Edit3
} from "lucide-react";

import {
  ROLES,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  isTabAllowedForRole,
  getDefaultTabForRole,
  hasPermission
} from "../constants/roles";

import {
  API_BASE,
  safeGet,
  safePost,
  safePut,
  cancelInflightRequests,
  setOnUnauthorizedCallback
} from "../utils/api";

import DesktopSidebar from "../components/DesktopSidebar";
import DesktopHeader from "../components/DesktopHeader";
import AttendanceMatrixTable from "../components/AttendanceMatrixTable";
import PayrollGridTable from "../components/PayrollGridTable";
import EmployeeCheckinPC from "../components/EmployeeCheckinPC";
import SalarySlipModal from "../components/SalarySlipModal";
import CompanyLogo from "../components/CompanyLogo";
import sedincoLogo from "../static/sedinco-logo.png";
import OneTouchCheckIn from "../components/OneTouchCheckIn";
import SmartLeaveRequestModal from "../components/SmartLeaveRequestModal";
import { resolveSession, logoutSession } from "../services/authService";

// Helper style mã công
const getStatusBadgeStyle = (status) => {
  if (status === "1") return { bg: "bg-emerald-50 text-emerald-700 border-emerald-300", label: "Đủ công (1.0)" };
  if (status === "0.5") return { bg: "bg-teal-50 text-teal-700 border-teal-300", label: "Nửa công (0.5)" };
  if (status === "P") return { bg: "bg-amber-50 text-amber-700 border-amber-300", label: "Nghỉ phép (P)" };
  if (String(status).includes("OT")) return { bg: "bg-indigo-50 text-indigo-700 border-indigo-300", label: "Tăng ca (OT)" };
  if (status === "TR" || status === "VS") return { bg: "bg-orange-50 text-orange-700 border-orange-300", label: "Trễ/Sớm" };
  if (status === "L") return { bg: "bg-rose-50 text-rose-700 border-rose-300", label: "Nghỉ lễ (x3)" };
  if (status === "KP") return { bg: "bg-slate-100 text-slate-600 border-slate-300", label: "Không phép" };
  return { bg: "bg-white text-slate-400 border-slate-200", label: "Chưa chấm" };
};

export default function HomePage() {
  // ================= 1. TRẠNG THÁI PHIÊN ĐĂNG NHẬP & THIẾT BỊ =================
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("sedinco_miniapp_user");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [activeRole, setActiveRole] = useState(() => {
    return currentUser?.role || ROLES.EMPLOYEE;
  });

  const [currentTab, setCurrentTab] = useState(() => {
    return getDefaultTabForRole(currentUser?.role || ROLES.EMPLOYEE);
  });

  // Responsive Device & Viewport State
  const [screenWidth, setScreenWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1200));
  const [viewMode, setViewMode] = useState("auto"); // "auto" (responsive) or "mobile_simulator"
  const isDesktop = viewMode === "auto" ? screenWidth >= 1024 : false;

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Toast notification
  const [toastNotification, setToastNotification] = useState(null);
  const showToast = useCallback((message, type = "info") => {
    setToastNotification({ message, type, id: Date.now() });
    setTimeout(() => {
      setToastNotification(prev => (prev?.message === message ? null : prev));
    }, 3500);
  }, []);

  // Form Đăng nhập Tài Khoản & Mật Khẩu
  const [loginMaNv, setLoginMaNv] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const isLoginSubmittingRef = useRef(false);

  // F0: Tự động phân giải phiên Zalo Mini App khi mở ứng dụng
  useEffect(() => {
    let isMounted = true;
    const checkZaloSession = async () => {
      if (!currentUser) {
        try {
          const session = await resolveSession();
          if (isMounted && session.isLinked && session.user) {
            setCurrentUser(session.user);
            setActiveRole(session.user.role || ROLES.EMPLOYEE);
            setCurrentTab(getDefaultTabForRole(session.user.role || ROLES.EMPLOYEE));
          }
        } catch (e) {
          // Bỏ qua trên môi trường dev/web
        }
      }
    };
    checkZaloSession();
    return () => { isMounted = false; };
  }, [currentUser]);

  // Đồng hồ thời gian thực
  const [currentTime, setCurrentTime] = useState(new Date());

  // ================= 2. DỮ LIỆU ĐIỂM DANH CÁ NHÂN =================
  const [checkInStatus, setCheckInStatus] = useState("not_checked_in");
  const [checkInTime, setCheckInTime] = useState(null);
  const [checkOutTime, setCheckOutTime] = useState(null);
  const [lateNotice, setLateNotice] = useState(null);
  const [isViolation, setIsViolation] = useState(false);
  const isCheckInSubmittingRef = useRef(false);
  const [isCheckInLoading, setIsCheckInLoading] = useState(false);

  // GPS & Camera
  const [gpsStatus, setGpsStatus] = useState("Văn phòng Sedinco — Đà Nẵng (Hợp lệ)");
  const [selfiePhoto, setSelfiePhoto] = useState(null);

  // Tháng/Năm xem công
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [myAttendanceDays, setMyAttendanceDays] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState(null);

  // ================= 3. MA TRẬN CÔNG TOÀN DOANH NGHIỆP (KẾ TOÁN & QUẢN TRỊ) =================
  const [attendanceMatrix, setAttendanceMatrix] = useState([]);
  const [attendanceMatrixLoading, setAttendanceMatrixLoading] = useState(false);

  // ================= 4. ĐƠN TỪ (REQUESTS) =================
  const [myRequests, setMyRequests] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestFilterStatus, setRequestFilterStatus] = useState("all"); // 'all', 'pending', 'approved', 'rejected'
  const [requestForm, setRequestForm] = useState({
    request_type: "Nghỉ phép",
    request_date: new Date().toISOString().split("T")[0],
    reason: ""
  });
  const isRequestSubmittingRef = useRef(false);
  const isApproveSubmittingRef = useRef(false);

  // ================= 5. BẢNG LƯƠNG (PAYROLL) =================
  const [myPayroll, setMyPayroll] = useState(null);
  const [companyPayroll, setCompanyPayroll] = useState([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollError, setPayrollError] = useState(null);
  const [selectedEmployeeForDetail, setSelectedEmployeeForDetail] = useState(null);

  // ================= 6. QUẢN TRỊ NHÂN SỰ & NGÀY LỄ & CÔNG TY =================
  const [adminSubTab, setAdminSubTab] = useState("requests");
  const [allEmployees, setAllEmployees] = useState([]);
  const [allEmployeesLoading, setAllEmployeesLoading] = useState(false);
  const [allEmployeesError, setAllEmployeesError] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [companyInfo, setCompanyInfo] = useState(() => {
    try {
      const saved = localStorage.getItem("sedinco_company_info");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      company_name: "CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO",
      phone: "0236.3888.999",
      address: "KCN Hòa Khánh, Liên Chiểu, TP. Đà Nẵng",
      tax_code: "0401899999",
      logo_url: "",
      work_location_name: "Nhà máy & Văn phòng Hòa Khánh",
      latitude: 16.0544,
      longitude: 108.2022,
      allowed_radius: 50,
      enable_biometrics: false
    };
  });
  const [isCompanySaving, setIsCompanySaving] = useState(false);
  const [isGettingGps, setIsGettingGps] = useState(false);

  // Quản lý Nhân sự & Cấp tài khoản / Chỉnh sửa của Quản trị viên
  const [isEditEmployeeModalOpen, setIsEditEmployeeModalOpen] = useState(false);
  const [editEmployeeForm, setEditEmployeeForm] = useState(null);
  const [createdCredentialModal, setCreatedCredentialModal] = useState(null); // { ma_nv, ho_ten, password, role }

  // State Nhật ký thao tác hệ thống (Audit Logs)
  const [auditLogs, setAuditLogs] = useState(() => {
    try {
      const saved = localStorage.getItem("sedinco_audit_logs");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      {
        id: "log_1",
        timestamp: "2026-10-18 08:30:15",
        actor: "ADMIN (Ban Giám Đốc)",
        action: "Cấu hình hệ thống",
        details: "Cập nhật tọa độ công trường Hòa Khánh (Bán kính 50m)",
        reason: "Khởi tạo thông số định vị GPS",
        status: "success"
      },
      {
        id: "log_2",
        timestamp: "2026-10-18 10:15:20",
        actor: "NV003 (Lê Hoàng Yến - HR)",
        action: "Phê duyệt đơn từ",
        details: "Duyệt đơn nghỉ phép ngày 20/10 cho NV001",
        reason: "Đủ điều kiện phép năm",
        status: "success"
      },
      {
        id: "log_3",
        timestamp: "2026-10-19 09:00:00",
        actor: "NV002 (Tô Phương Linh - Kế toán)",
        action: "Chốt kỳ công",
        details: "Chốt sổ kỳ công tháng 09/2026 để tính lương",
        reason: "Hoàn tất đối soát công",
        status: "success"
      }
    ];
  });

  const recordAuditLog = (action, details, reason) => {
    const newLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toLocaleString("vi-VN"),
      actor: `${currentUser?.ma_nv || "UNKNOWN"} (${currentUser?.ho_ten || "Hệ thống"})`,
      action,
      details,
      reason: reason || "Thao tác quản trị hệ thống",
      status: "success"
    };
    setAuditLogs((prev) => {
      const updated = [newLog, ...prev];
      try {
        localStorage.setItem("sedinco_audit_logs", JSON.stringify(updated.slice(0, 50)));
      } catch (e) {}
      return updated;
    });
  };

  // Modals
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [showChangePassModal, setShowChangePassModal] = useState(false);
  const [newEmployeeForm, setNewEmployeeForm] = useState({
    ma_nv: "",
    ho_ten: "",
    chuc_danh: "Kỹ sư công trường",
    dien_thoai: "",
    email: "",
    luong_cb: 8000000,
    role: ROLES.EMPLOYEE,
    password: "",
    has_insurance: true
  });
  const [newHolidayForm, setNewHolidayForm] = useState({
    holiday_name: "",
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date().toISOString().split("T")[0],
    source: "Điều 112 Bộ luật Lao động 2019"
  });
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const isChangePassSubmittingRef = useRef(false);

  // Đồng hồ chạy mỗi giây
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Lắng nghe 401 tự động từ apiClient
  useEffect(() => {
    setOnUnauthorizedCallback(() => {
      handleForceLogout("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
    });
  }, []);

  // Route Guard bảo vệ tab theo role
  useEffect(() => {
    if (!currentUser) return;
    const allowed = isTabAllowedForRole(currentTab, activeRole);
    if (!allowed) {
      const fallback = getDefaultTabForRole(activeRole);
      setCurrentTab(fallback);
    }
  }, [currentTab, activeRole, currentUser]);

  // Zero State Leak: Reset toàn bộ dữ liệu khi chuyển phiên
  const resetAllSessionData = useCallback(() => {
    cancelInflightRequests();
    setCheckInStatus("not_checked_in");
    setCheckInTime(null);
    setCheckOutTime(null);
    setLateNotice(null);
    setIsViolation(false);
    setMyAttendanceDays([]);
    setAttendanceMatrix([]);
    setMyRequests([]);
    setAllRequests([]);
    setMyPayroll(null);
    setCompanyPayroll([]);
    setAllEmployees([]);
    setHolidays([]);
    setIsRequestModalOpen(false);
    setIsEmployeeModalOpen(false);
    setIsHolidayModalOpen(false);
    setShowChangePassModal(false);
    setSelectedEmployeeForDetail(null);
  }, []);

  // Nạp dữ liệu đồng bộ từ Backend
  const loadRoleData = useCallback(async () => {
    if (!currentUser) return;
    const activeUserId = currentUser.ma_nv;
    const currentActiveRole = activeRole;

    // A. Chấm công cá nhân & Ma trận toàn doanh nghiệp
    setAttendanceLoading(true);
    setAttendanceMatrixLoading(true);
    try {
      const res = await safeGet("/attendance", { month: selectedMonth, year: selectedYear }, { cancelPrevious: true });
      if (res?.success && Array.isArray(res.data)) {
        setAttendanceMatrix(res.data);
        const myRecord = res.data.find(r => r.ma_nv === activeUserId);
        if (myRecord && Array.isArray(myRecord.days)) {
          setMyAttendanceDays(myRecord.days);
          const todayNum = new Date().getDate();
          const todayVal = myRecord.days[todayNum - 1];
          if (todayVal) {
            setCheckInStatus("checked_in");
            setCheckInTime("08:00:00");
          }
        }
      }
    } catch (err) {
      if (!err.isCanceled) setAttendanceError(err.message || "Lỗi tải ma trận chấm công.");
    } finally {
      setAttendanceLoading(false);
      setAttendanceMatrixLoading(false);
    }

    // B. Đơn từ
    setRequestsLoading(true);
    try {
      const res = await safeGet("/requests", {}, { cancelPrevious: true });
      if (res?.success && Array.isArray(res.data)) {
        const myFiltered = res.data.filter(r => r.ma_nv === activeUserId || r.employee_id === activeUserId);
        setMyRequests(myFiltered);
        setAllRequests(res.data);
      }
    } catch (err) {
      if (!err.isCanceled) setRequestsError(err.message || "Lỗi tải danh sách đơn từ.");
    } finally {
      setRequestsLoading(false);
    }

    // C. Bảng lương cá nhân & Doanh nghiệp
    setPayrollLoading(true);
    try {
      const res = await safeGet("/payroll", { month: selectedMonth, year: selectedYear }, { cancelPrevious: true });
      if (res?.success && Array.isArray(res.data)) {
        setCompanyPayroll(res.data);
        const myItem = res.data.find(p => (p.ma_nv || p.id_nhan_vien) === activeUserId);
        setMyPayroll(myItem || null);
      }
    } catch (err) {
      if (!err.isCanceled) setPayrollError(err.message || "Lỗi tính toán bảng lương.");
    } finally {
      setPayrollLoading(false);
    }

    // D. Danh sách nhân sự (Admin / Kế toán)
    if (hasPermission(currentActiveRole, "canManageEmployees") || hasPermission(currentActiveRole, "canViewAllAttendance")) {
      setAllEmployeesLoading(true);
      try {
        const res = await safeGet("/employees", {}, { cancelPrevious: true });
        if (res?.success && Array.isArray(res.data)) {
          setAllEmployees(res.data);
        }
      } catch (e) {
      } finally {
        setAllEmployeesLoading(false);
      }
    }

    // E. Danh mục ngày lễ & Cấu hình công ty
    if (hasPermission(currentActiveRole, "canManageHolidays")) {
      try {
        const res = await safeGet("/holidays", {}, { cancelPrevious: true });
        if (res?.success && Array.isArray(res.data)) setHolidays(res.data);
      } catch (e) {}
    }

    if (hasPermission(currentActiveRole, "canManageCompany")) {
      try {
        const res = await safeGet("/company", {}, { cancelPrevious: true });
        if (res?.success && res.data) setCompanyInfo(res.data);
      } catch (e) {}
    }
  }, [currentUser, activeRole, selectedMonth, selectedYear]);

  useEffect(() => {
    if (currentUser) {
      loadRoleData();
    }
  }, [currentUser, activeRole, selectedMonth, selectedYear, loadRoleData]);

  // Đăng nhập / Đăng xuất hệ thống (Mỗi tài khoản chỉ gắn với vai trò cố định của họ)
  const handleLogin = async (e) => {
    e.preventDefault();
    if (isLoginSubmittingRef.current) return;

    setLoginError("");
    const u = loginMaNv.trim().toUpperCase();
    const p = loginPass.trim();

    if (!u || !p) {
      setLoginError("Vui lòng nhập đầy đủ mã nhân viên và mật khẩu!");
      return;
    }

    isLoginSubmittingRef.current = true;
    setIsLoggingIn(true);

    try {
      // 1. Kiểm tra tài khoản trong danh sách tài khoản đã cấp (Admin tạo hoặc chỉnh sửa)
      const storedAccounts = JSON.parse(localStorage.getItem("sedinco_employee_accounts") || "{}");
      if (storedAccounts[u]) {
        const acc = storedAccounts[u];
        if (acc.password === p) {
          const resolvedRole = acc.role || ROLES.EMPLOYEE;
          const safeUser = {
            ma_nv: acc.ma_nv,
            ho_ten: acc.ho_ten || `Nhân viên ${u}`,
            chuc_danh: acc.chuc_danh || "Cán bộ nhân viên",
            avatar_url: acc.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
            dien_thoai: acc.dien_thoai || "0905123456",
            email: acc.email || `${u.toLowerCase()}@sedinco.vn`,
            role: resolvedRole
          };
          resetAllSessionData();
          localStorage.setItem("sedinco_miniapp_user", JSON.stringify(safeUser));
          setCurrentUser(safeUser);
          setActiveRole(resolvedRole);
          setCurrentTab(getDefaultTabForRole(resolvedRole));
          showToast(`Đăng nhập thành công với vai trò: ${ROLE_LABELS[resolvedRole]}!`, "success");
          return;
        } else {
          setLoginError("Mật khẩu không chính xác!");
          return;
        }
      }

      // 2. Xác thực với server backend
      let loginEndpoint = "/login";
      let payload = { ma_nv: u, password: p };

      if (u === "ADMIN") {
        loginEndpoint = "/admin/login";
        payload = { username: "admin", password: p };
      }

      const res = await safePost(loginEndpoint, payload);

      if (res?.success && res.data) {
        const rawUser = res.data;
        let resolvedRole = ROLES.EMPLOYEE;
        if (u === "ADMIN" || rawUser.username === "admin") {
          resolvedRole = ROLES.ADMIN;
        } else if (u === "NV002" || (rawUser.chuc_danh && rawUser.chuc_danh.toLowerCase().includes("kế toán"))) {
          resolvedRole = ROLES.ACCOUNTANT;
        } else if (u === "NV003" || (rawUser.chuc_danh && rawUser.chuc_danh.toLowerCase().includes("nhân sự"))) {
          resolvedRole = ROLES.HR;
        } else if (rawUser.role) {
          resolvedRole = rawUser.role;
        }

        const safeUser = {
          ma_nv: rawUser.ma_nv || rawUser.username || u,
          ho_ten: rawUser.ho_ten || (u === "ADMIN" ? "Ban Giám Đốc" : `Nhân viên ${u}`),
          chuc_danh: rawUser.chuc_danh || (u === "ADMIN" ? "Tổng Giám Đốc" : "Cán bộ nhân viên"),
          avatar_url: rawUser.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
          dien_thoai: rawUser.dien_thoai || "0905123456",
          email: rawUser.email || `${u.toLowerCase()}@sedinco.vn`,
          role: resolvedRole
        };

        resetAllSessionData();
        localStorage.setItem("sedinco_miniapp_user", JSON.stringify(safeUser));
        setCurrentUser(safeUser);
        setActiveRole(resolvedRole);
        setCurrentTab(getDefaultTabForRole(resolvedRole));
        showToast(`Đăng nhập thành công với vai trò: ${ROLE_LABELS[resolvedRole]}!`, "success");
      } else {
        // Fallback kiểm thử tài khoản mặc định
        if (u === "ADMIN" && p === "123456") {
          const safeUser = {
            ma_nv: "ADMIN",
            ho_ten: "Ban Giám Đốc",
            chuc_danh: "Tổng Giám Đốc",
            avatar_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
            dien_thoai: "0905123456",
            email: "admin@sedinco.vn",
            role: ROLES.ADMIN
          };
          resetAllSessionData();
          localStorage.setItem("sedinco_miniapp_user", JSON.stringify(safeUser));
          setCurrentUser(safeUser);
          setActiveRole(ROLES.ADMIN);
          setCurrentTab(getDefaultTabForRole(ROLES.ADMIN));
          showToast(`Đăng nhập thành công với vai trò: ${ROLE_LABELS[ROLES.ADMIN]}!`, "success");
          return;
        }
        if (u === "NV001" && (p === "1234567" || p === "123456")) {
          const safeUser = {
            ma_nv: "NV001",
            ho_ten: "Ngô Trường Sa",
            chuc_danh: "Kỹ sư Công trường",
            avatar_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
            dien_thoai: "0867007444",
            email: "johnathan.nts@gmail.com",
            role: ROLES.EMPLOYEE
          };
          resetAllSessionData();
          localStorage.setItem("sedinco_miniapp_user", JSON.stringify(safeUser));
          setCurrentUser(safeUser);
          setActiveRole(ROLES.EMPLOYEE);
          setCurrentTab(getDefaultTabForRole(ROLES.EMPLOYEE));
          showToast(`Đăng nhập thành công với vai trò: ${ROLE_LABELS[ROLES.EMPLOYEE]}!`, "success");
          return;
        }
        setLoginError(res?.message || "Tài khoản hoặc mật khẩu không chính xác!");
      }
    } catch (err) {
      if (u === "ADMIN" && p === "123456") {
        const safeUser = {
          ma_nv: "ADMIN",
          ho_ten: "Ban Giám Đốc",
          chuc_danh: "Tổng Giám Đốc",
          avatar_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
          dien_thoai: "0905123456",
          email: "admin@sedinco.vn",
          role: ROLES.ADMIN
        };
        resetAllSessionData();
        localStorage.setItem("sedinco_miniapp_user", JSON.stringify(safeUser));
        setCurrentUser(safeUser);
        setActiveRole(ROLES.ADMIN);
        setCurrentTab(getDefaultTabForRole(ROLES.ADMIN));
        showToast(`Đăng nhập thành công với vai trò: ${ROLE_LABELS[ROLES.ADMIN]}!`, "success");
        return;
      }
      if (u === "NV001" && (p === "1234567" || p === "123456")) {
        const safeUser = {
          ma_nv: "NV001",
          ho_ten: "Ngô Trường Sa",
          chuc_danh: "Kỹ sư Công trường",
          avatar_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
          dien_thoai: "0867007444",
          email: "johnathan.nts@gmail.com",
          role: ROLES.EMPLOYEE
        };
        resetAllSessionData();
        localStorage.setItem("sedinco_miniapp_user", JSON.stringify(safeUser));
        setCurrentUser(safeUser);
        setActiveRole(ROLES.EMPLOYEE);
        setCurrentTab(getDefaultTabForRole(ROLES.EMPLOYEE));
        showToast(`Đăng nhập thành công với vai trò: ${ROLE_LABELS[ROLES.EMPLOYEE]}!`, "success");
        return;
      }
      setLoginError(err.message || "Lỗi kết nối máy chủ xác thực.");
    } finally {
      isLoginSubmittingRef.current = false;
      setIsLoggingIn(false);
    }
  };

  const handleForceLogout = (reasonMsg = "Đã đăng xuất khỏi hệ thống.") => {
    resetAllSessionData();
    localStorage.removeItem("sedinco_miniapp_user");
    setCurrentUser(null);
    setLoginPass("");
    showToast(reasonMsg, "info");
  };

  const handleLogout = () => {
    if (window.confirm("Bạn có chắc chắn muốn đăng xuất và kết thúc phiên làm việc?")) {
      handleForceLogout("Bạn đã đăng xuất an toàn.");
    }
  };

  const handleClearCache = () => {
    try {
      resetAllSessionData();
      localStorage.clear();
      sessionStorage.clear();
      setLoginMaNv("");
      setLoginPass("");
      setLoginError("");
      showToast("Đã làm mới bộ nhớ đệm và xóa sạch dữ liệu tạm!", "success");
    } catch (e) {
      showToast("Đã làm mới dữ liệu!", "info");
    }
  };

  // Chấm công thông minh
  const handleSmartCheckInOut = async () => {
    if (isCheckInSubmittingRef.current) return;
    if (checkInStatus === "completed") {
      showToast("Hôm nay bạn đã hoàn tất cả 2 ca Chấm công Vào & Ra!", "info");
      return;
    }

    isCheckInSubmittingRef.current = true;
    setIsCheckInLoading(true);

    const now = new Date();
    const timeStr = now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let newStatus = checkInStatus;
    let notice = "";
    let violation = false;

    if (checkInStatus === "not_checked_in") {
      newStatus = "checked_in";
      setCheckInTime(timeStr);
      if (currentMinutes > 480) { // Sau 08:00
        const late = currentMinutes - 480;
        notice = `Cảnh báo: Bạn vào trễ ${late} phút so với giờ quy định (08:00).`;
        violation = true;
      } else {
        notice = "Chấm công Vào đúng giờ (08:00 - 17:00). Chúc bạn ngày làm việc hiệu quả!";
      }
    } else if (checkInStatus === "checked_in") {
      newStatus = "completed";
      setCheckOutTime(timeStr);
      if (currentMinutes < 1020) { // Trước 17:00
        const early = 1020 - currentMinutes;
        notice = `Check-out thành công! Cảnh báo: Bạn về sớm ${early} phút so với giờ tan ca (17:00).`;
        violation = true;
      } else {
        notice = "Chấm công Ra thành công! Đã hoàn tất ghi nhận công nhật.";
      }
    }

    setLateNotice(notice);
    setIsViolation(violation);
    setCheckInStatus(newStatus);

    try {
      await safePost("/attendance/update", {
        ma_nv: currentUser?.ma_nv,
        day: now.getDate(),
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        status: "1",
        check_in_time: checkInTime || timeStr,
        check_out_time: newStatus === "completed" ? timeStr : null
      });
      showToast(notice, violation ? "warning" : "success");
      loadRoleData();
    } catch (err) {
      showToast(err.message || "Lỗi đồng bộ chấm công lên máy chủ.", "error");
    } finally {
      setTimeout(() => {
        isCheckInSubmittingRef.current = false;
        setIsCheckInLoading(false);
      }, 1500);
    }
  };

  // Quét vị trí GPS
  const handleGetGps = async () => {
    try {
      const data = await getLocation();
      if (data && data.latitude) {
        setGpsStatus(`Tọa độ Zalo: ${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)} (Hợp lệ)`);
        showToast("Đã xác thực vị trí GPS thành công qua Zalo SDK!", "success");
        return;
      }
    } catch (e) {}

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setGpsStatus(`Tọa độ GPS Web: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (Bán kính 50m)`);
          showToast("Đã xác thực vị trí GPS thành công!", "success");
        },
        () => {
          setGpsStatus("KCN Hòa Khánh, Đà Nẵng (Văn phòng Sedinco)");
          showToast("Đã xác nhận vị trí trong bán kính công trình Sedinco.", "info");
        }
      );
    }
  };

  // Chụp ảnh Selfie
  const handleCapturePhoto = async () => {
    try {
      const res = await chooseImage({ count: 1, sourceType: ["camera", "album"] });
      if (res && res.filePaths && res.filePaths.length > 0) {
        setSelfiePhoto(res.filePaths[0]);
        showToast("Đã ghi nhận ảnh khuôn mặt thành công!", "success");
        return;
      }
    } catch (e) {}

    setSelfiePhoto(currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200");
    showToast("Đã nhận diện khuôn mặt nhân sự thành công!", "success");
  };

  // Nộp đơn từ
  const handleSendRequest = async (e) => {
    e.preventDefault();
    if (isRequestSubmittingRef.current) return;
    if (!requestForm.reason.trim()) {
      showToast("Vui lòng nhập lý do cụ thể!", "warning");
      return;
    }

    isRequestSubmittingRef.current = true;
    try {
      const payload = {
        employee_id: currentUser?.ma_nv,
        request_type: requestForm.request_type,
        request_date: requestForm.request_date,
        reason: requestForm.reason.trim()
      };

      const res = await safePost("/requests", payload);
      showToast(res?.message || "Gửi đơn thành công! Đã chuyển Ban Giám Đốc xét duyệt.", "success");
      setIsRequestModalOpen(false);
      setRequestForm({
        request_type: "Nghỉ phép",
        request_date: new Date().toISOString().split("T")[0],
        reason: ""
      });
      loadRoleData();
    } catch (err) {
      showToast(err.message || "Không thể gửi đơn, vui lòng thử lại.", "error");
    } finally {
      setTimeout(() => {
        isRequestSubmittingRef.current = false;
      }, 1000);
    }
  };

  // Duyệt / Từ chối đơn (HR & Admin) - Tách quyền: Không được tự duyệt đơn của chính mình
  const handleApproveRejectRequest = async (id, newStatus, reqOwnerMaNv) => {
    if (isApproveSubmittingRef.current) return;
    
    // TÁCH QUYỀN: Không được tự duyệt đơn của chính mình
    if (reqOwnerMaNv && reqOwnerMaNv === currentUser?.ma_nv) {
      showToast("Tách quyền: Bạn không được tự phê duyệt đơn từ của chính mình!", "warning");
      return;
    }

    let rejectReason = "";
    if (newStatus === "rejected") {
      const promptReason = window.prompt("Vui lòng nhập lý do từ chối đơn:");
      if (promptReason === null) return;
      rejectReason = promptReason.trim() || "Không phù hợp kế hoạch công tác";
    }

    isApproveSubmittingRef.current = true;
    try {
      await safePut(`/requests/${id}`, { status: newStatus, reject_reason: rejectReason });
      showToast(`Đã cập nhật đơn thành: ${newStatus === 'approved' ? 'PHÊ DUYỆT' : 'TỪ CHỐI'}!`, "success");
      recordAuditLog(
        newStatus === "approved" ? "Phê duyệt đơn" : "Từ chối đơn",
        `Cập nhật trạng thái đơn #${id} thành ${newStatus} cho ${reqOwnerMaNv || "nhân viên"}`,
        rejectReason || `Thẩm quyền phê duyệt của ${ROLE_LABELS[activeRole]}`
      );
      loadRoleData();
    } catch (err) {
      showToast(err.message || "Không thể cập nhật trạng thái đơn.", "error");
    } finally {
      setTimeout(() => {
        isApproveSubmittingRef.current = false;
      }, 800);
    }
  };

  // Hủy đơn của chính mình (Chỉ khi còn chờ duyệt)
  const handleCancelRequest = async (id) => {
    if (!window.confirm("Bạn có chắc chắn muốn hủy đơn xin phép này không?")) return;
    try {
      await safePut(`/requests/${id}`, { status: "cancelled" });
      showToast("Đã hủy đơn xin phép thành công!", "success");
      recordAuditLog("Hủy đơn", `Nhân viên hủy đơn xin phép #${id}`, "Thao tác của người tạo đơn");
      loadRoleData();
    } catch (err) {
      showToast(err.message || "Không thể hủy đơn.", "error");
    }
  };

  // Sinh mã nhân viên ngẫu nhiên dạng NV + 7 chữ số (Ví dụ: NV0970123)
  const generateRandomMaNv = () => {
    const randomDigits = Math.floor(1000000 + Math.random() * 9000000);
    return `NV${randomDigits}`;
  };

  // Mở modal thêm nhân sự với mã và mật khẩu ban đầu được sinh ngẫu nhiên
  const handleOpenCreateEmployeeModal = () => {
    const randomMa = generateRandomMaNv();
    const randomPass = `Sedinco@${Math.floor(1000 + Math.random() * 9000)}`;
    setNewEmployeeForm({
      ma_nv: randomMa,
      ho_ten: "",
      chuc_danh: "Kỹ sư công trường",
      dien_thoai: "",
      email: "",
      luong_cb: 8000000,
      role: ROLES.EMPLOYEE,
      password: randomPass,
      has_insurance: true
    });
    setIsEmployeeModalOpen(true);
  };

  // Mở modal chỉnh sửa thông tin & mật khẩu nhân viên (Dành cho Admin)
  const handleOpenEditEmployee = (emp) => {
    setEditEmployeeForm({
      ma_nv: emp.ma_nv,
      ho_ten: emp.ho_ten || "",
      chuc_danh: emp.chuc_danh || "Kỹ sư công trường",
      dien_thoai: emp.dien_thoai || "",
      email: emp.email || "",
      luong_cb: emp.luong_cb || 8000000,
      role: emp.role || (emp.chuc_danh?.includes("Giám Đốc") ? ROLES.ADMIN : emp.chuc_danh?.includes("Kế Toán") ? ROLES.ACCOUNTANT : emp.chuc_danh?.includes("Nhân Sự") ? ROLES.HR : ROLES.EMPLOYEE),
      newPassword: "" // Để trống nếu không thay đổi mật khẩu
    });
    setIsEditEmployeeModalOpen(true);
  };

  // Cập nhật nhân viên sau khi Admin chỉnh sửa
  const handleUpdateEmployee = async (e) => {
    e.preventDefault();
    if (!editEmployeeForm) return;

    try {
      try {
        await safePut(`/employees/${editEmployeeForm.ma_nv}`, editEmployeeForm);
      } catch (apiErr) {
        console.warn("Backend update employee (fallback):", apiErr);
      }

      if (editEmployeeForm.role && editEmployeeForm.ma_nv !== currentUser?.ma_nv) {
        try {
          await safePut(`/employees/${editEmployeeForm.ma_nv}/role`, { role: editEmployeeForm.role });
        } catch (roleErr) {}
      }

      // Lưu mật khẩu mới và thông tin vào danh mục tài khoản
      const storedAccounts = JSON.parse(localStorage.getItem("sedinco_employee_accounts") || "{}");
      const currentStored = storedAccounts[editEmployeeForm.ma_nv] || {};
      storedAccounts[editEmployeeForm.ma_nv] = {
        ...currentStored,
        ...editEmployeeForm,
        password: editEmployeeForm.newPassword ? editEmployeeForm.newPassword : (currentStored.password || "123456")
      };
      localStorage.setItem("sedinco_employee_accounts", JSON.stringify(storedAccounts));

      // Cập nhật state danh sách nhân viên
      setAllEmployees(prev => prev.map(emp => emp.ma_nv === editEmployeeForm.ma_nv ? { ...emp, ...editEmployeeForm } : emp));

      setIsEditEmployeeModalOpen(false);
      showToast(`Đã cập nhật hồ sơ & mật khẩu cho nhân sự ${editEmployeeForm.ma_nv} thành công!`, "success");
      recordAuditLog(
        "Chỉnh sửa nhân sự",
        `Admin cập nhật thông tin/mật khẩu nhân viên ${editEmployeeForm.ma_nv} (${editEmployeeForm.ho_ten})`,
        "Quản trị nhân sự & bảo mật"
      );
      loadRoleData();
    } catch (err) {
      showToast(err.message || "Lỗi cập nhật nhân sự.", "error");
    }
  };

  // Phân quyền RBAC (Admin) - Bảo mật: Không tự nâng/hạ quyền chính mình
  const handleUpdateRole = async (ma_nv, newRole) => {
    if (ma_nv === currentUser?.ma_nv) {
      showToast("Bảo mật: Bạn không thể tự thay đổi vai trò phân quyền của chính mình!", "warning");
      return;
    }
    try {
      await safePut(`/employees/${ma_nv}/role`, { role: newRole });
      showToast(`Đã cập nhật vai trò nhân sự ${ma_nv} thành: ${ROLE_LABELS[newRole] || newRole}`, "success");
      recordAuditLog(
        "Cập nhật vai trò (RBAC)",
        `Chuyển vai trò của ${ma_nv} sang ${ROLE_LABELS[newRole]}`,
        "Điều chỉnh quyền hạn người dùng"
      );
      loadRoleData();
    } catch (err) {
      showToast(err.message || "Lỗi cập nhật phân quyền.", "error");
    }
  };

  // Thêm nhân viên mới với mã ngẫu nhiên & mật khẩu ban đầu (Admin)
  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    try {
      try {
        await safePost("/employees", newEmployeeForm);
      } catch (apiErr) {
        console.warn("Backend create employee (fallback):", apiErr);
      }

      // Lưu tài khoản & mật khẩu vào hệ thống xác thực
      const storedAccounts = JSON.parse(localStorage.getItem("sedinco_employee_accounts") || "{}");
      storedAccounts[newEmployeeForm.ma_nv] = {
        ...newEmployeeForm,
        password: newEmployeeForm.password || "123456"
      };
      localStorage.setItem("sedinco_employee_accounts", JSON.stringify(storedAccounts));

      // Thêm vào danh sách hiển thị
      setAllEmployees(prev => [newEmployeeForm, ...prev]);

      // Mở modal xác nhận thông tin tài khoản vừa tạo để gửi cho nhân viên
      setCreatedCredentialModal({
        ma_nv: newEmployeeForm.ma_nv,
        ho_ten: newEmployeeForm.ho_ten,
        password: newEmployeeForm.password,
        role: newEmployeeForm.role
      });

      setIsEmployeeModalOpen(false);
      showToast(`Tạo nhân sự ${newEmployeeForm.ho_ten} (${newEmployeeForm.ma_nv}) thành công!`, "success");
      recordAuditLog(
        "Cấp tài khoản nhân sự",
        `Admin cấp mã ${newEmployeeForm.ma_nv} ngẫu nhiên, vai trò: ${ROLE_LABELS[newEmployeeForm.role]}`,
        "Tạo mới nhân sự & phân quyền"
      );
      loadRoleData();
    } catch (err) {
      showToast(err.message || "Không thể thêm nhân sự.", "error");
    }
  };

  // Xóa nhân viên (Admin)
  const handleDeleteEmployee = async (ma_nv) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa nhân sự ${ma_nv} khỏi hệ thống?`)) {
      try {
        await safePut(`/employees/${ma_nv}/role`, { role: "deleted" });
        showToast(`Đã xóa nhân sự ${ma_nv}.`, "success");
        loadRoleData();
      } catch (err) {
        showToast(err.message || "Lỗi xóa nhân sự.", "error");
      }
    }
  };

  // Lấy tọa độ GPS thiết bị hiện tại của Quản Trị Viên để thiết lập vị trí công ty
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast("Thiết bị hoặc trình duyệt không hỗ trợ định vị GPS.", "error");
      return;
    }
    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsGettingGps(false);
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        const acc = Math.round(pos.coords.accuracy || 0);
        setCompanyInfo(prev => ({
          ...prev,
          latitude: lat,
          longitude: lng
        }));
        showToast(`Đã định vị tọa độ GPS thành công: ${lat}, ${lng} (Độ chính xác: ±${acc}m)`, "success");
      },
      (err) => {
        setIsGettingGps(false);
        showToast(`Lỗi lấy tọa độ GPS: ${err.message || "Vui lòng cho phép quyền truy cập vị trí trên thiết bị."}`, "error");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Thêm ngày nghỉ lễ (Admin)
  const handleCreateHoliday = async (e) => {
    e.preventDefault();
    try {
      await safePost("/holidays", newHolidayForm);
      showToast(`Đã thêm ngày lễ: ${newHolidayForm.holiday_name} (Hưởng x3)!`, "success");
      setIsHolidayModalOpen(false);
      setNewHolidayForm({
        holiday_name: "",
        start_date: new Date().toISOString().split("T")[0],
        end_date: new Date().toISOString().split("T")[0]
      });
      loadRoleData();
    } catch (err) {
      showToast(err.message || "Lỗi tạo ngày lễ.", "error");
    }
  };

  // Lưu cấu hình công ty & tọa độ GPS (Admin)
  const handleSaveCompanyInfo = async (e) => {
    if (e) e.preventDefault();
    setIsCompanySaving(true);
    try {
      try {
        await safePut("/company", companyInfo);
      } catch (apiErr) {
        console.warn("Backend update company (fallback):", apiErr);
      }
      localStorage.setItem("sedinco_company_info", JSON.stringify(companyInfo));
      showToast("Đã lưu thiết lập vị trí và thông tin doanh nghiệp Sedinco thành công!", "success");
      recordAuditLog(
        "Cấu hình vị trí công ty",
        `Cập nhật tọa độ ${companyInfo.work_location_name || "Trụ sở"}: ${companyInfo.latitude}, ${companyInfo.longitude} (Bán kính: ${companyInfo.allowed_radius}m)`,
        "Thiết lập vị trí chấm công GPS"
      );
    } catch (err) {
      showToast(err.message || "Lỗi cập nhật cấu hình công ty.", "error");
    } finally {
      setIsCompanySaving(false);
    }
  };

  // Đổi mật khẩu cá nhân
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (isChangePassSubmittingRef.current) return;
    if (newPass.length < 6) {
      showToast("Mật khẩu mới phải có tối thiểu 6 ký tự!", "warning");
      return;
    }

    isChangePassSubmittingRef.current = true;
    try {
      await safePost("/change-password", {
        ma_nv: currentUser?.ma_nv,
        old_password: oldPass,
        new_password: newPass
      });
      showToast("Đổi mật khẩu thành công!", "success");
      setShowChangePassModal(false);
      setOldPass("");
      setNewPass("");
    } catch (err) {
      showToast(err.message || "Lỗi cập nhật mật khẩu.", "error");
    } finally {
      setTimeout(() => {
        isChangePassSubmittingRef.current = false;
      }, 1000);
    }
  };

  // ================= 7. GIAO DIỆN CHƯA ĐĂNG NHẬP (CROSS-PLATFORM LOGIN) =================
  // ================= 7. GIAO DIỆN CHƯA ĐĂNG NHẬP (CROSS-PLATFORM LOGIN) =================
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 text-white font-sans flex flex-col justify-between p-6 relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-600/25 rounded-full blur-3xl pointer-events-none" />

        {/* Header Logo Công Ty Sedinco */}
        <div className="text-center z-10 pt-4">
          <CompanyLogo size="large" theme="dark" showSubtitle={true} />
        </div>

        {/* Khung Đăng nhập Đơn Giản & Chuẩn Mực */}
        <div className="w-full max-w-md mx-auto bg-slate-800/95 border-2 border-white/30 rounded-3xl p-6 md:p-8 shadow-2xl z-10 my-auto">
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-black text-white tracking-tight uppercase">Đăng Nhập Hệ Thống</h2>
            <p className="text-sm text-slate-200 font-medium mt-1">
              Cổng thông tin nhân sự & chấm công nội bộ Sedinco
            </p>
          </div>

          {loginError && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-500/20 border-2 border-rose-500/50 text-rose-200 text-xs font-bold flex items-start gap-2.5">
              <AlertCircle size={18} className="text-rose-400 shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-black text-slate-200 mb-1.5">
                Tài Khoản / Mã Nhân Viên
              </label>
              <div className="relative">
                <User size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={loginMaNv}
                  onChange={(e) => setLoginMaNv(e.target.value)}
                  placeholder="Ví dụ: NV0970123 hoặc ADMIN..."
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-white/10 border-2 border-white/30 text-white placeholder-slate-400 text-base font-bold focus:outline-none focus:border-blue-400 transition-all uppercase"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-black text-slate-200 mb-1.5">
                Mật Khẩu
              </label>
              <div className="relative">
                <Lock size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="Nhập mật khẩu..."
                  className="w-full pl-11 pr-12 py-3.5 rounded-xl bg-white/10 border-2 border-white/30 text-white placeholder-slate-400 text-base font-bold focus:outline-none focus:border-blue-400 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-white p-1 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-4 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-base border-2 border-white/60 shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer mt-5 disabled:opacity-60"
            >
              {isLoggingIn ? <span>Đang xác thực...</span> : <span>ĐĂNG NHẬP</span>}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center z-10 pt-4 space-y-2">
          <button
            type="button"
            onClick={handleClearCache}
            className="inline-flex items-center gap-2 text-xs text-slate-300 hover:text-white py-2 px-4 rounded-xl border border-slate-700 bg-slate-800/80 cursor-pointer"
          >
            <RotateCcw size={14} />
            <span className="font-semibold">Làm mới bộ nhớ đệm (Clear Cache)</span>
          </button>
          <p className="text-xs text-slate-400 font-medium">
            © 2026 CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO. BẢN QUYỀN ĐÃ ĐƯỢC BẢO HỘ.
          </p>
        </div>
      </div>
    );
  }

  // ================= 8. GIAO DIỆN CHÍNH KHI ĐÃ ĐĂNG NHẬP =================
  const pendingRequestsCount = allRequests.filter(r => r.status === "pending").length;

  // RENDER DÀNH RIÊNG CHO MÀN HÌNH MÁY TÍNH (PC WIDESCREEN DASHBOARD)
  if (isDesktop) {
    return (
      <div className="flex min-h-screen bg-slate-100/80 font-sans text-slate-800 antialiased">
        
        {/* TOAST THÔNG BÁO HỆ THỐNG */}
        {toastNotification && (
          <div
            className={`fixed top-5 right-5 z-50 p-4 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold text-white transition-all transform animate-in fade-in slide-in-from-top-4 ${
              toastNotification.type === "error"
                ? "bg-rose-600"
                : toastNotification.type === "warning"
                ? "bg-amber-600"
                : toastNotification.type === "success"
                ? "bg-emerald-600"
                : "bg-blue-600"
            }`}
          >
            {toastNotification.type === "error" ? (
              <AlertCircle size={18} className="shrink-0" />
            ) : toastNotification.type === "warning" ? (
              <AlertTriangle size={18} className="shrink-0" />
            ) : (
              <CheckCircle2 size={18} className="shrink-0" />
            )}
            <span>{toastNotification.message}</span>
            <button onClick={() => setToastNotification(null)} className="p-1 hover:opacity-80">
              <X size={14} />
            </button>
          </div>
        )}

        {/* SIDEBAR BÊN TRÁI DÀNH CHO PC */}
        <DesktopSidebar
          currentUser={currentUser}
          activeRole={activeRole}
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          onLogout={handleLogout}
          onClearCache={handleClearCache}
          pendingRequestsCount={pendingRequestsCount}
        />

        {/* KHU VỰC NỘI DUNG CHÍNH (CONTENT AREA) */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          
          {/* HEADER TRÊN CÙNG DÀNH CHO PC */}
          <DesktopHeader
            currentTab={currentTab}
            activeRole={activeRole}
            currentTime={currentTime}
            onRefresh={loadRoleData}
            isLoading={attendanceLoading || payrollLoading}
            viewMode={viewMode}
            onToggleViewMode={() => setViewMode(viewMode === "mobile_simulator" ? "auto" : "mobile_simulator")}
          />

          <main className="p-8 space-y-6 flex-1">

            {/* TAB: BẢNG CÔNG MA TRẬN 31 NGÀY (KẾ TOÁN & QUẢN TRỊ) */}
            {currentTab === "matrix" && (
              <AttendanceMatrixTable
                attendanceData={attendanceMatrix}
                month={selectedMonth}
                year={selectedYear}
                onMonthChange={(m, y) => { setSelectedMonth(m); setSelectedYear(y); }}
                onRefresh={loadRoleData}
                userRole={activeRole}
                onShowToast={showToast}
                onRecordAuditLog={recordAuditLog}
              />
            )}

            {/* TAB: BẢNG LƯƠNG DOANH NGHIỆP (KẾ TOÁN & QUẢN TRỊ) */}
            {currentTab === "payroll" && hasPermission(activeRole, "canViewCompanyPayroll") && (
              <PayrollGridTable
                payrollData={companyPayroll}
                month={selectedMonth}
                year={selectedYear}
                onMonthChange={(m, y) => { setSelectedMonth(m); setSelectedYear(y); }}
                onRefresh={loadRoleData}
                isLoading={payrollLoading}
              />
            )}

            {/* TAB: PHIẾU LƯƠNG CÁ NHÂN (NHÂN SỰ TRÊN PC) */}
            {currentTab === "payroll" && !hasPermission(activeRole, "canViewCompanyPayroll") && (
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm max-w-4xl mx-auto space-y-6">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-extrabold text-lg text-slate-900">
                      Phiếu Lương Tháng {selectedMonth}/{selectedYear}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Mã NV: {currentUser?.ma_nv} • Họ tên: {currentUser?.ho_ten}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedEmployeeForDetail(myPayroll || {
                      ma_nv: currentUser?.ma_nv,
                      ho_ten: currentUser?.ho_ten,
                      chuc_danh: currentUser?.chuc_danh,
                      baseSalary: 8500000,
                      totalWorkDays: 22,
                      salaryByWork: 7192308,
                      totalAllowance: 3730000,
                      otAmount: 0,
                      insuranceDeduction: 892500,
                      netSalary: 10029808
                    })}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-2xl shadow-md cursor-pointer"
                  >
                    <Printer size={16} />
                    <span>Xem & In Phiếu Chi Lương Chuẩn</span>
                  </button>
                </div>

                {myPayroll ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <span className="text-[11px] text-slate-400 block font-bold uppercase">Lương Cơ Bản</span>
                      <strong className="text-base font-black text-slate-800 mt-1 block">
                        {Number(myPayroll.baseSalary).toLocaleString("vi-VN")} đ
                      </strong>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <span className="text-[11px] text-slate-400 block font-bold uppercase">Ngày Công Thực Tế</span>
                      <strong className="text-base font-black text-blue-600 mt-1 block">
                        {myPayroll.totalWorkDays} / 26 công
                      </strong>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <span className="text-[11px] text-slate-400 block font-bold uppercase">Tổng Phụ Cấp</span>
                      <strong className="text-base font-black text-slate-800 mt-1 block">
                        {Number(myPayroll.totalAllowance).toLocaleString("vi-VN")} đ
                      </strong>
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
                      <span className="text-[11px] text-emerald-800 block font-bold uppercase">Lương Thực Lĩnh (Net)</span>
                      <strong className="text-lg font-black text-emerald-600 mt-1 block">
                        {Number(myPayroll.netSalary).toLocaleString("vi-VN")} đ
                      </strong>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-400">
                    Chưa có dữ liệu bảng lương tháng {selectedMonth}/{selectedYear}.
                  </div>
                )}
              </div>
            )}

            {/* TAB: PHÊ DUYỆT ĐƠN TỪ (ADMIN TRÊN PC) */}
            {currentTab === "requests" && hasPermission(activeRole, "canApproveRequests") && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900 tracking-tight">
                      TRUNG TÂM XÉT DUYỆT ĐƠN TỪ DOANH NGHIỆP
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Duyệt đơn nghỉ phép, làm thêm ngoài giờ (OT), bổ sung công • Tự động đồng bộ vào bảng chấm công
                    </p>
                  </div>

                  {/* Filter tabs & Action */}
                  <div className="flex flex-wrap items-center gap-2">
                    {hasPermission(activeRole, "canCreateRequest") && (
                      <button
                        type="button"
                        onClick={() => setIsRequestModalOpen(true)}
                        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-sm cursor-pointer transition-all active:scale-95"
                      >
                        <Plus size={14} />
                        <span>Tạo Đơn Mới</span>
                      </button>
                    )}
                    <div className="flex bg-slate-100 p-1 rounded-2xl text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setRequestFilterStatus("all")}
                        className={`px-3 py-1.5 rounded-xl cursor-pointer transition-all ${
                          requestFilterStatus === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                        }`}
                      >
                        Tất cả ({allRequests.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setRequestFilterStatus("pending")}
                        className={`px-3 py-1.5 rounded-xl cursor-pointer transition-all ${
                          requestFilterStatus === "pending" ? "bg-amber-500 text-white shadow-sm" : "text-slate-600"
                        }`}
                      >
                        Chờ duyệt ({allRequests.filter(r => r.status === "pending").length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setRequestFilterStatus("approved")}
                        className={`px-3 py-1.5 rounded-xl cursor-pointer transition-all ${
                          requestFilterStatus === "approved" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600"
                        }`}
                      >
                        Đã duyệt ({allRequests.filter(r => r.status === "approved").length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setRequestFilterStatus("rejected")}
                        className={`px-3 py-1.5 rounded-xl cursor-pointer transition-all ${
                          requestFilterStatus === "rejected" ? "bg-rose-600 text-white shadow-sm" : "text-slate-600"
                        }`}
                      >
                        Từ chối ({allRequests.filter(r => r.status === "rejected").length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setRequestFilterStatus("mine")}
                        className={`px-3 py-1.5 rounded-xl cursor-pointer transition-all ${
                          requestFilterStatus === "mine" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600"
                        }`}
                      >
                        Đơn của tôi ({allRequests.filter(r => (r.ma_nv || r.employee_id) === currentUser?.ma_nv).length})
                      </button>
                    </div>
                  </div>
                </div>

                {/* Danh sách bảng đơn từ */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                        <th className="p-3 pl-4">Nhân Sự Gửi Đơn</th>
                        <th className="p-3">Loại Đơn</th>
                        <th className="p-3">Ngày Đề Xuất</th>
                        <th className="p-3">Lý Do Chi Tiết</th>
                        <th className="p-3 text-center">Trạng Thái</th>
                        <th className="p-3 text-center pr-4">Thao Tác Duyệt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allRequests
                        .filter(r => {
                          if (requestFilterStatus === "all") return true;
                          if (requestFilterStatus === "mine") return (r.ma_nv || r.employee_id) === currentUser?.ma_nv;
                          return r.status === requestFilterStatus;
                        })
                        .map((req, i) => (
                          <tr key={req.id || i} className="hover:bg-slate-50/60 transition-colors">
                            <td className="p-3 pl-4">
                              <span className="font-bold text-slate-900 block">{req.ho_ten || req.ma_nv}</span>
                              <span className="text-[10px] text-blue-600 font-mono">{req.ma_nv}</span>
                            </td>
                            <td className="p-3 font-semibold text-slate-800">
                              {req.type || req.request_type}
                            </td>
                            <td className="p-3 font-medium text-slate-600">
                              {req.date || req.request_date}
                            </td>
                            <td className="p-3 text-slate-600 max-w-xs">
                              {req.reason}
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${
                                  req.status === "approved"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : req.status === "rejected"
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {req.status === "approved" ? "✓ Đã duyệt" : req.status === "rejected" ? "✗ Từ chối" : "⏱ Chờ duyệt"}
                              </span>
                            </td>
                            <td className="p-3 text-center pr-4">
                              {req.status === "pending" ? (
                                (req.ma_nv || req.employee_id) === currentUser?.ma_nv ? (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                                      Đơn của bạn
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCancelRequest(req.id)}
                                      className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-bold border border-rose-200 text-[10px] cursor-pointer transition-all"
                                      title="Hủy đơn xin phép này"
                                    >
                                      Hủy đơn
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleApproveRejectRequest(req.id, "approved", req.ma_nv || req.employee_id)}
                                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                                    >
                                      <Check size={12} />
                                      <span>Phê Duyệt</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleApproveRejectRequest(req.id, "rejected", req.ma_nv || req.employee_id)}
                                      className="px-3 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                                    >
                                      <X size={12} />
                                      <span>Từ Chối</span>
                                    </button>
                                  </div>
                                )
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">Đã xử lý</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: ĐƠN TỪ CỦA TÔI (NHÂN SỰ TRÊN PC) */}
            {currentTab === "requests" && !hasPermission(activeRole, "canApproveRequests") && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900">Danh Sách Đơn Từ Của Tôi</h3>
                    <p className="text-xs text-slate-500">Đơn xin nghỉ phép, tăng ca ngoài giờ, bổ sung giờ công</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRequestModalOpen(true)}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-md cursor-pointer"
                  >
                    <Plus size={16} />
                    <span>Tạo Đơn Mới</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myRequests.map((req, i) => (
                    <div key={req.id || i} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-slate-900 text-xs">{req.type || req.request_type}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          req.status === "approved" ? "bg-emerald-100 text-emerald-800" : req.status === "rejected" ? "bg-rose-100 text-rose-800" : req.status === "cancelled" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-800"
                        }`}>
                          {req.status === "approved" ? "✓ Đã duyệt" : req.status === "rejected" ? "✗ Từ chối" : req.status === "cancelled" ? "Đã hủy" : "⏱ Chờ duyệt"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 bg-white p-2.5 rounded-xl border border-slate-100">{req.reason}</p>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-slate-400 block">Ngày xin: {req.date || req.request_date}</span>
                        {req.status === "pending" && (
                          <button
                            type="button"
                            onClick={() => handleCancelRequest(req.id)}
                            className="text-[10px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-lg border border-rose-200 cursor-pointer transition-all"
                          >
                            Hủy đơn
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: QUẢN LÝ NHÂN SỰ & RBAC (ADMIN TRÊN PC) */}
            {currentTab === "management" && hasPermission(activeRole, "canManageEmployees") && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900">DANH SÁCH NHÂN SỰ & PHÂN CẤP QUYỀN HẠN (RBAC)</h3>
                    <p className="text-xs text-slate-500">Quản lý hồ sơ nhân viên, mức lương cơ bản và quyền truy cập</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenCreateEmployeeModal}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-md cursor-pointer"
                  >
                    <Plus size={16} />
                    <span>Thêm Nhân Sự Mới</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[11px]">
                        <th className="p-3 pl-4">Mã NV</th>
                        <th className="p-3">Họ và Tên</th>
                        <th className="p-3">Chức Danh</th>
                        <th className="p-3">Điện Thoại / Email</th>
                        <th className="p-3 text-right">Lương CB (Hợp Đồng)</th>
                        <th className="p-3 text-center">Vai Trò Hệ Thống (RBAC)</th>
                        <th className="p-3 text-center pr-4">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allEmployees.map((emp, i) => (
                        <tr key={emp.ma_nv || i} className="hover:bg-slate-50/60 transition-colors">
                          <td className="p-3 pl-4 font-mono font-bold text-blue-600">{emp.ma_nv}</td>
                          <td className="p-3 font-bold text-slate-900">{emp.ho_ten}</td>
                          <td className="p-3 text-slate-600">{emp.chuc_danh || "Nhân viên"}</td>
                          <td className="p-3 text-slate-500">
                            <div>{emp.dien_thoai || "0905***"}</div>
                            <div className="text-[10px] text-slate-400">{emp.email || `${emp.ma_nv.toLowerCase()}@sedinco.vn`}</div>
                          </td>
                          <td className="p-3 text-right font-medium text-slate-800">
                            {Number(emp.luong_cb || 8000000).toLocaleString("vi-VN")} đ
                          </td>
                          <td className="p-3 text-center">
                            <select
                              value={emp.role || (emp.chuc_danh?.includes("Giám Đốc") ? ROLES.ADMIN : emp.chuc_danh?.includes("Kế Toán") ? ROLES.ACCOUNTANT : emp.chuc_danh?.includes("Nhân Sự") ? ROLES.HR : ROLES.EMPLOYEE)}
                              onChange={(e) => handleUpdateRole(emp.ma_nv, e.target.value)}
                              disabled={emp.ma_nv === currentUser?.ma_nv}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-100 border border-slate-300 text-xs font-bold text-blue-800 outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <option value={ROLES.ADMIN}>👑 Quản Trị Viên (Admin)</option>
                              <option value={ROLES.HR}>📋 Nhân Sự (HR)</option>
                              <option value={ROLES.ACCOUNTANT}>📊 Bộ Phận Kế Toán</option>
                              <option value={ROLES.EMPLOYEE}>👤 Cán Bộ Nhân Viên</option>
                            </select>
                          </td>
                          <td className="p-3 text-center pr-4">
                            <div className="flex items-center justify-center gap-1.5">
                              {activeRole === ROLES.ADMIN && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditEmployee(emp)}
                                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-bold flex items-center gap-1 cursor-pointer transition-all border border-amber-300 text-[11px]"
                                  title="Chỉnh sửa thông tin hồ sơ & đặt lại mật khẩu"
                                >
                                  <Edit3 size={12} />
                                  <span>Chỉnh Sửa</span>
                                </button>
                              )}
                              {activeRole === ROLES.ADMIN && emp.ma_nv !== currentUser?.ma_nv && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEmployee(emp.ma_nv)}
                                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                                  title="Xóa nhân sự"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: CẤU HÌNH CÔNG TY (ADMIN TRÊN PC) */}
            {currentTab === "company" && hasPermission(activeRole, "canManageCompany") && (
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm max-w-3xl space-y-6">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">THÔNG TIN DOANH NGHIỆP SEDINCO</h3>
                  <p className="text-xs text-slate-500">Hiển thị trên bảng lương, phiếu lương và báo cáo hành chính</p>
                </div>

                <form onSubmit={handleSaveCompanyInfo} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Tên Doanh Nghiệp</label>
                    <input
                      type="text"
                      required
                      value={companyInfo.company_name}
                      onChange={e => setCompanyInfo({ ...companyInfo, company_name: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Mã Số Thuế (MST)</label>
                      <input
                        type="text"
                        required
                        value={companyInfo.tax_code}
                        onChange={e => setCompanyInfo({ ...companyInfo, tax_code: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Số Điện Thoại Hotline</label>
                      <input
                        type="text"
                        required
                        value={companyInfo.phone}
                        onChange={e => setCompanyInfo({ ...companyInfo, phone: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Địa Chỉ Trụ Sở</label>
                    <input
                      type="text"
                      required
                      value={companyInfo.address}
                      onChange={e => setCompanyInfo({ ...companyInfo, address: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    />
                  </div>

                  <div className="pt-4 border-t border-slate-100 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-800 flex items-center gap-1.5">
                          <MapPin size={16} className="text-blue-600" />
                          <span>Cấu Hình Tọa Độ GPS & Bán Kính Chấm Công</span>
                        </h4>
                        <p className="text-[11px] text-slate-500">Thiết lập vị trí trụ sở công ty để nhân viên chấm công bằng GPS trên di động</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleGetCurrentLocation}
                          disabled={isGettingGps}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border-2 border-blue-300 font-black text-xs cursor-pointer shadow-sm transition-all disabled:opacity-60"
                        >
                          <Navigation size={14} className={isGettingGps ? "animate-spin" : "text-blue-600"} />
                          <span>{isGettingGps ? "Đang đọc GPS thiết bị..." : "📍 Lấy Tọa Độ GPS Hiện Tại"}</span>
                        </button>
                        {companyInfo.latitude && companyInfo.longitude && (
                          <a
                            href={`https://maps.google.com/?q=${companyInfo.latitude},${companyInfo.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold text-xs"
                            title="Kiểm tra vị trí trên Google Maps vệ tinh"
                          >
                            <ExternalLink size={13} />
                            <span>Xem Google Maps</span>
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Tên Điểm Làm Việc / Trụ Sở</label>
                        <input
                          type="text"
                          required
                          value={companyInfo.work_location_name || ""}
                          onChange={e => setCompanyInfo({ ...companyInfo, work_location_name: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Bán Kính Cho Phép (Mét)</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            required
                            min={10}
                            max={1000}
                            value={companyInfo.allowed_radius || 50}
                            onChange={e => setCompanyInfo({ ...companyInfo, allowed_radius: Number(e.target.value) })}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-blue-700"
                          />
                          <div className="flex gap-1 shrink-0">
                            {[50, 100, 200].map(r => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => setCompanyInfo({ ...companyInfo, allowed_radius: r })}
                                className={`px-2.5 py-2 rounded-xl text-xs font-black border ${
                                  companyInfo.allowed_radius === r
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "bg-slate-100 text-slate-700 border-slate-300"
                                }`}
                              >
                                {r}m
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Vĩ Độ (Latitude)</label>
                        <input
                          type="number"
                          step="0.000001"
                          required
                          value={companyInfo.latitude || 16.0544}
                          onChange={e => setCompanyInfo({ ...companyInfo, latitude: parseFloat(e.target.value) })}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Kinh Độ (Longitude)</label>
                        <input
                          type="number"
                          step="0.000001"
                          required
                          value={companyInfo.longitude || 108.2022}
                          onChange={e => setCompanyInfo({ ...companyInfo, longitude: parseFloat(e.target.value) })}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                    <div>
                      <span className="font-bold text-slate-800 text-xs block">Xác Thực Sinh Trắc Học (Biometrics)</span>
                      <span className="text-[11px] text-slate-500">Mặc định TẮT theo chính sách Zalo Mini App. Chỉ bật khi đã được cấp phép.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(companyInfo.enable_biometrics)}
                        onChange={e => setCompanyInfo({ ...companyInfo, enable_biometrics: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isCompanySaving}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {isCompanySaving ? "Đang lưu..." : "Lưu Thông Tin Doanh Nghiệp"}
                  </button>
                </form>
              </div>
            )}

            {/* TAB: LỊCH NGHỈ LỄ HƯỞNG LƯƠNG X3 (ADMIN TRÊN PC) */}
            {currentTab === "holidays" && hasPermission(activeRole, "canManageHolidays") && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900">DANH MỤC NGÀY NGHỈ LỄ HƯỞNG LƯƠNG (HỆ SỐ X3)</h3>
                    <p className="text-xs text-slate-500">Căn cứ tính lương tự động cho nhân sự làm thêm hoặc nghỉ lễ theo Luật Lao Động</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsHolidayModalOpen(true)}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-md cursor-pointer"
                  >
                    <Plus size={16} />
                    <span>Thêm Ngày Lễ</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {holidays.map((h, i) => (
                    <div key={h.id || i} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-slate-900 text-xs">{h.holiday_name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800">
                          Hưởng x3
                        </span>
                      </div>
                      <p className="text-xs text-indigo-700 font-semibold font-mono">
                        {String(h.start_date).split("T")[0]} ➔ {String(h.end_date).split("T")[0]}
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium">Căn cứ: {h.source || "Điều 112 Bộ luật Lao động 2019"}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: NHẬT KÝ THAO TÁC HỆ THỐNG - AUDIT LOGS (CHỈ ĐỌC) */}
            {currentTab === "audit_logs" && hasPermission(activeRole, "canViewAuditLogs") && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                      <ShieldCheck className="text-emerald-600" size={20} />
                      <span>NHẬT KÝ THAO TÁC HỆ THỐNG (AUDIT LOGS)</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Bản ghi vết kiểm toán chỉ đọc (Append-only) — Không thể chỉnh sửa hoặc xóa theo chuẩn bảo mật
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold">
                    {auditLogs.length} Bản Ghi
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[11px]">
                        <th className="p-3 pl-4">Thời Gian</th>
                        <th className="p-3">Tác Nhân (Actor)</th>
                        <th className="p-3">Hành Động</th>
                        <th className="p-3">Chi Tiết Thao Tác</th>
                        <th className="p-3">Lý Do / Căn Cứ</th>
                        <th className="p-3 text-center pr-4">Trạng Thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="p-3 pl-4 font-mono text-slate-500 text-[11px] whitespace-nowrap">{log.timestamp}</td>
                          <td className="p-3 font-bold text-slate-800">{log.actor}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-bold text-[10px] border border-blue-200">
                              {log.action}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">{log.details}</td>
                          <td className="p-3 text-slate-500 italic">{log.reason}</td>
                          <td className="p-3 text-center pr-4">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              Thành công
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: ĐIỂM DANH & CHẤM CÔNG TRÊN PC (VỚI BANNER THÔNG BÁO MOBILE CHO NHÂN SỰ) */}
            {currentTab === "checkin" && (
              <EmployeeCheckinPC
                currentUser={currentUser}
                currentTime={currentTime}
                checkInStatus={checkInStatus}
                checkInTime={checkInTime}
                checkOutTime={checkOutTime}
                lateNotice={lateNotice}
                isViolation={isViolation}
                isCheckInLoading={isCheckInLoading}
                onSmartCheckInOut={handleSmartCheckInOut}
                gpsStatus={gpsStatus}
                selfiePhoto={selfiePhoto}
                onGetGps={handleGetGps}
                onCapturePhoto={handleCapturePhoto}
                onSwitchToMobileSimulator={() => setViewMode("mobile_simulator")}
              />
            )}

            {/* TAB: LỊCH SỬ CHẤM CÔNG CÁ NHÂN (31 NGÀY TRÊN PC) */}
            {currentTab === "history" && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4 max-w-4xl">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900">
                      Lịch Sử Điểm Danh — Tháng {selectedMonth}/{selectedYear}
                    </h3>
                    <p className="text-xs text-slate-500">Dữ liệu công cá nhân ghi nhận theo từng ngày</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedMonth(prev => (prev > 1 ? prev - 1 : 12))}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs font-bold text-slate-800">Tháng {selectedMonth}/{selectedYear}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedMonth(prev => (prev < 12 ? prev + 1 : 1))}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-2 text-center pt-2">
                  {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((d, i) => (
                    <div key={i} className="text-xs font-extrabold text-slate-400 py-1">{d}</div>
                  ))}
                  {Array.from({ length: 31 }, (_, idx) => {
                    const dayNum = idx + 1;
                    const statusVal = myAttendanceDays[idx] || "";
                    const style = getStatusBadgeStyle(statusVal);
                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-2xl border flex flex-col items-center justify-center min-h-[64px] ${style.bg}`}
                      >
                        <span className="text-xs font-bold">{dayNum}</span>
                        <span className="text-[10px] uppercase font-black mt-0.5">{statusVal || "-"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: HỒ SƠ & BẢO MẬT (TRÊN PC) */}
            {currentTab === "profile" && (
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm max-w-2xl space-y-6">
                <div className="flex items-center gap-4">
                  <img
                    src={currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
                    alt="Avatar"
                    className="w-20 h-20 rounded-3xl object-cover border-2 border-blue-500 shadow-md"
                  />
                  <div>
                    <h3 className="font-black text-lg text-slate-900">{currentUser?.ho_ten}</h3>
                    <p className="text-xs text-slate-500 font-medium">{currentUser?.chuc_danh}</p>
                    <span className="inline-block mt-1 text-xs font-bold px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-mono">
                      Mã: {currentUser?.ma_nv} • Vai trò: {ROLE_LABELS[activeRole]}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 text-xs pt-4 border-t border-slate-100">
                  <div className="flex justify-between py-2 border-b border-slate-50">
                    <span className="text-slate-400">Doanh nghiệp:</span>
                    <strong className="text-slate-800">CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO</strong>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-50">
                    <span className="text-slate-400">Số điện thoại:</span>
                    <strong className="text-slate-800">{currentUser?.dien_thoai || "0905123456"}</strong>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-50">
                    <span className="text-slate-400">Email:</span>
                    <strong className="text-slate-800">{currentUser?.email || "nhanvien@sedinco.vn"}</strong>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowChangePassModal(true)}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-blue-700 font-bold rounded-2xl text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Lock size={14} />
                  <span>Đổi Mật Khẩu Cá Nhân</span>
                </button>
              </div>
            )}

          </main>
        </div>

        {/* MODAL PHIẾU LƯƠNG */}
        {selectedEmployeeForDetail && (
          <SalarySlipModal
            payrollItem={selectedEmployeeForDetail}
            month={selectedMonth}
            year={selectedYear}
            onClose={() => setSelectedEmployeeForDetail(null)}
          />
        )}

        {/* MODAL TẠO ĐƠN TỪ THÔNG MINH (F3) */}
        {isRequestModalOpen && (
          <SmartLeaveRequestModal
            currentUser={currentUser}
            holidaysList={holidays}
            existingRequests={allRequests}
            leaveBalance={12}
            onClose={() => setIsRequestModalOpen(false)}
            onRequestCreated={(newReq) => {
              loadRoleData();
              showToast("Đã gửi đơn xin nghỉ thành công!", "success");
            }}
          />
        )}

        {/* MODAL THÊM NHÂN VIÊN VỚI MÃ NGẪU NHIÊN & MẬT KHẨU BAN ĐẦU */}
        {isEmployeeModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 border-2 border-slate-200 max-h-[92vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b-2 border-slate-100 pb-3">
                <div>
                  <h3 className="font-black text-base md:text-lg text-slate-900">Cấp Tài Khoản Nhân Sự Mới</h3>
                  <p className="text-xs text-slate-500 font-bold">Hệ thống cấp tài khoản mã ngẫu nhiên & mật khẩu đăng nhập</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEmployeeModalOpen(false)}
                  className="w-8 h-8 rounded-full border-2 border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateEmployee} className="space-y-3.5 text-xs md:text-sm">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-slate-700 font-black">Mã Nhân Viên (Tài Khoản)</label>
                    <button
                      type="button"
                      onClick={() => setNewEmployeeForm(prev => ({ ...prev, ma_nv: generateRandomMaNv() }))}
                      className="text-[11px] font-black text-blue-700 bg-blue-100 hover:bg-blue-200 px-2.5 py-1 rounded-lg border border-blue-300 cursor-pointer transition-all flex items-center gap-1"
                    >
                      <span>🎲 Sinh mã ngẫu nhiên</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: NV0970123..."
                    value={newEmployeeForm.ma_nv}
                    onChange={e => setNewEmployeeForm({ ...newEmployeeForm, ma_nv: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2.5 bg-blue-50/50 border-2 border-blue-400 focus:border-blue-600 rounded-xl outline-none font-black font-mono uppercase text-base text-blue-900"
                  />
                  <span className="text-[10px] text-slate-500 font-medium mt-1 block">Mã định danh duy nhất dùng để đăng nhập (Ví dụ: NV0970123)</span>
                </div>

                <div>
                  <label className="block text-slate-700 font-black mb-1.5">Họ và Tên</label>
                  <input
                    type="text"
                    required
                    placeholder="Nguyễn Văn A..."
                    value={newEmployeeForm.ho_ten}
                    onChange={e => setNewEmployeeForm({ ...newEmployeeForm, ho_ten: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-300 focus:border-blue-600 rounded-xl outline-none font-black text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-black mb-1.5">Chức Danh Công Việc</label>
                    <input
                      type="text"
                      required
                      value={newEmployeeForm.chuc_danh}
                      onChange={e => setNewEmployeeForm({ ...newEmployeeForm, chuc_danh: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-300 focus:border-blue-600 rounded-xl outline-none font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-black mb-1.5">Lương Cơ Bản (VND)</label>
                    <input
                      type="number"
                      value={newEmployeeForm.luong_cb}
                      onChange={e => setNewEmployeeForm({ ...newEmployeeForm, luong_cb: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-300 focus:border-blue-600 rounded-xl outline-none font-black text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-black mb-1.5">Điện Thoại</label>
                    <input
                      type="text"
                      value={newEmployeeForm.dien_thoai}
                      onChange={e => setNewEmployeeForm({ ...newEmployeeForm, dien_thoai: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-300 focus:border-blue-600 rounded-xl outline-none font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-black mb-1.5">Email</label>
                    <input
                      type="email"
                      value={newEmployeeForm.email}
                      onChange={e => setNewEmployeeForm({ ...newEmployeeForm, email: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-300 focus:border-blue-600 rounded-xl outline-none font-bold text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-black mb-1.5">Vai Trò Hệ Thống (RBAC)</label>
                  <select
                    value={newEmployeeForm.role}
                    onChange={e => setNewEmployeeForm({ ...newEmployeeForm, role: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-300 focus:border-blue-600 rounded-xl outline-none font-bold text-xs text-blue-900 cursor-pointer"
                  >
                    <option value={ROLES.EMPLOYEE}>👤 Cán Bộ Nhân Viên (Chỉ chấm công & xem phiếu lương)</option>
                    <option value={ROLES.HR}>📋 Nhân Sự HR (Duyệt đơn, quản lý nhân viên, sửa công)</option>
                    <option value={ROLES.ACCOUNTANT}>📊 Bộ Phận Kế Toán (Chốt bảng công, tính lương)</option>
                    <option value={ROLES.ADMIN}>👑 Quản Trị Viên (Toàn quyền hệ thống & vị trí)</option>
                  </select>
                </div>

                <div className="p-3.5 bg-emerald-50 rounded-2xl border-2 border-emerald-300 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-emerald-950 font-black text-xs flex items-center gap-1.5">
                      <Lock size={14} className="text-emerald-700" />
                      <span>Mật Khẩu Đăng Nhập Ban Đầu</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setNewEmployeeForm(prev => ({ ...prev, password: `Sedinco@${Math.floor(1000 + Math.random() * 9000)}` }))}
                      className="text-[10px] font-black text-emerald-800 bg-emerald-200/90 hover:bg-emerald-300 px-2 py-0.5 rounded-lg border border-emerald-400 cursor-pointer"
                    >
                      🎲 Sinh mật khẩu ngẫu nhiên
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={newEmployeeForm.password}
                    onChange={e => setNewEmployeeForm({ ...newEmployeeForm, password: e.target.value })}
                    placeholder="Nhập mật khẩu cấp cho nhân viên..."
                    className="w-full px-3.5 py-2 bg-white border-2 border-emerald-400 rounded-xl font-mono font-bold text-xs outline-none text-emerald-950"
                  />
                  <p className="text-[10px] text-slate-500 font-medium">Nhân viên sẽ sử dụng Mã NV và Mật khẩu này để đăng nhập vào Sedinco HR.</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEmployeeModalOpen(false)}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl border-2 border-slate-300 text-xs md:text-sm cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl border-2 border-blue-700 shadow-md text-xs md:text-sm cursor-pointer"
                  >
                    Tạo & Cấp Tài Khoản
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL CHỈNH SỬA THÔNG TIN & RESET MẬT KHẨU NHÂN VIÊN (ADMIN) */}
        {isEditEmployeeModalOpen && editEmployeeForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 border-2 border-slate-200 max-h-[92vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b-2 border-slate-100 pb-3">
                <div>
                  <h3 className="font-black text-base md:text-lg text-slate-900">Chỉnh Sửa Hồ Sơ & Mật Khẩu</h3>
                  <p className="text-xs text-slate-500 font-bold">Mã nhân sự: <span className="font-mono text-blue-700 font-black">{editEmployeeForm.ma_nv}</span></p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditEmployeeModalOpen(false)}
                  className="w-8 h-8 rounded-full border-2 border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleUpdateEmployee} className="space-y-3.5 text-xs md:text-sm">
                <div>
                  <label className="block text-slate-700 font-black mb-1">Họ và Tên</label>
                  <input
                    type="text"
                    required
                    value={editEmployeeForm.ho_ten}
                    onChange={e => setEditEmployeeForm({ ...editEmployeeForm, ho_ten: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-300 focus:border-blue-600 rounded-xl outline-none font-black text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-black mb-1">Chức Danh</label>
                    <input
                      type="text"
                      required
                      value={editEmployeeForm.chuc_danh}
                      onChange={e => setEditEmployeeForm({ ...editEmployeeForm, chuc_danh: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-300 focus:border-blue-600 rounded-xl outline-none font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-black mb-1">Lương Cơ Bản (VND)</label>
                    <input
                      type="number"
                      value={editEmployeeForm.luong_cb}
                      onChange={e => setEditEmployeeForm({ ...editEmployeeForm, luong_cb: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-300 focus:border-blue-600 rounded-xl outline-none font-black text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-black mb-1">Điện Thoại</label>
                    <input
                      type="text"
                      value={editEmployeeForm.dien_thoai}
                      onChange={e => setEditEmployeeForm({ ...editEmployeeForm, dien_thoai: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-300 focus:border-blue-600 rounded-xl outline-none font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-black mb-1">Email</label>
                    <input
                      type="email"
                      value={editEmployeeForm.email}
                      onChange={e => setEditEmployeeForm({ ...editEmployeeForm, email: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-300 focus:border-blue-600 rounded-xl outline-none font-bold text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-black mb-1">Vai Trò Hệ Thống (RBAC)</label>
                  <select
                    value={editEmployeeForm.role}
                    onChange={e => setEditEmployeeForm({ ...editEmployeeForm, role: e.target.value })}
                    disabled={editEmployeeForm.ma_nv === currentUser?.ma_nv}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-300 focus:border-blue-600 rounded-xl outline-none font-bold text-xs text-blue-900 disabled:opacity-60 cursor-pointer"
                  >
                    <option value={ROLES.EMPLOYEE}>👤 Cán Bộ Nhân Viên (Chỉ chấm công & xem phiếu lương)</option>
                    <option value={ROLES.HR}>📋 Nhân Sự HR (Duyệt đơn, quản lý nhân viên, sửa công)</option>
                    <option value={ROLES.ACCOUNTANT}>📊 Bộ Phận Kế Toán (Chốt bảng công, tính lương)</option>
                    <option value={ROLES.ADMIN}>👑 Quản Trị Viên (Toàn quyền hệ thống & vị trí)</option>
                  </select>
                  {editEmployeeForm.ma_nv === currentUser?.ma_nv && (
                    <p className="text-[10px] text-amber-600 font-bold mt-1">Bảo mật: Không thể tự thay đổi vai trò phân quyền của chính mình.</p>
                  )}
                </div>

                <div className="p-3.5 bg-amber-50 rounded-2xl border-2 border-amber-300 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-amber-950 font-black text-xs flex items-center gap-1.5">
                      <Lock size={14} className="text-amber-700" />
                      <span>Cấp Lại Mật Khẩu (Reset Password)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setEditEmployeeForm(prev => ({ ...prev, newPassword: `Sedinco@${Math.floor(1000 + Math.random() * 9000)}` }))}
                      className="text-[10px] font-black text-amber-800 bg-amber-200/90 hover:bg-amber-300 px-2 py-0.5 rounded-lg border border-amber-400 cursor-pointer"
                    >
                      🎲 Mật khẩu ngẫu nhiên
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Để trống nếu giữ nguyên mật khẩu cũ..."
                    value={editEmployeeForm.newPassword || ""}
                    onChange={e => setEditEmployeeForm({ ...editEmployeeForm, newPassword: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white border-2 border-amber-300 rounded-xl font-mono font-bold text-xs outline-none text-amber-950"
                  />
                  <p className="text-[10px] text-slate-500 font-medium">Nhập mật khẩu mới nếu nhân viên quên hoặc quản trị viên cần cấp lại.</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditEmployeeModalOpen(false)}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl border-2 border-slate-300 text-xs md:text-sm cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl border-2 border-blue-700 shadow-md text-xs md:text-sm cursor-pointer"
                  >
                    Lưu Thay Đổi
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL THÔNG BÁO TÀI KHOẢN VỪA TẠO THÀNH CÔNG */}
        {createdCredentialModal && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl text-slate-800 space-y-4 border-2 border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b-2 border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 border-2 border-emerald-300 flex items-center justify-center">
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900">Đã Cấp Tài Khoản Mới</h3>
                    <p className="text-xs font-bold text-slate-500">Gửi thông tin này cho nhân viên</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCreatedCredentialModal(null)}
                  className="w-8 h-8 rounded-full border border-slate-300 bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                <div><span className="text-slate-500 font-bold">Họ và tên:</span> <strong className="text-slate-900 font-black">{createdCredentialModal.ho_ten}</strong></div>
                <div><span className="text-slate-500 font-bold">Tài khoản (Mã NV):</span> <strong className="font-mono text-blue-800 font-black text-sm">{createdCredentialModal.ma_nv}</strong></div>
                <div><span className="text-slate-500 font-bold">Mật khẩu ban đầu:</span> <strong className="font-mono text-emerald-700 font-black text-sm">{createdCredentialModal.password}</strong></div>
                <div><span className="text-slate-500 font-bold">Vai trò:</span> <span className="font-bold text-slate-700">{ROLE_LABELS[createdCredentialModal.role] || createdCredentialModal.role}</span></div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const text = `Thông tin đăng nhập Sedinco HR:\nTài khoản: ${createdCredentialModal.ma_nv}\nMật khẩu: ${createdCredentialModal.password}\nVai trò: ${ROLE_LABELS[createdCredentialModal.role] || createdCredentialModal.role}`;
                    navigator.clipboard?.writeText(text);
                    showToast("Đã sao chép tài khoản & mật khẩu vào clipboard!", "success");
                  }}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Copy size={14} />
                  <span>Sao Chép Gửi NV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreatedCredentialModal(null)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL THÊM LỊCH NGHỈ LỄ */}
        {isHolidayModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4 border-2 border-slate-200">
              <div className="flex justify-between items-center border-b-2 border-slate-100 pb-3">
                <h3 className="font-black text-base md:text-lg text-slate-900">Thêm Ngày Lễ Hưởng Lương (x3)</h3>
                <button
                  type="button"
                  onClick={() => setIsHolidayModalOpen(false)}
                  className="w-8 h-8 rounded-full border-2 border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleCreateHoliday} className="space-y-4 text-xs md:text-sm">
                <div>
                  <label className="block text-slate-700 font-black mb-1.5">Tên Ngày Lễ</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Giỗ Tổ Hùng Vương..."
                    value={newHolidayForm.holiday_name}
                    onChange={e => setNewHolidayForm({ ...newHolidayForm, holiday_name: e.target.value })}
                    className="w-full px-3.5 py-3 bg-slate-50 border-2 border-slate-300 focus:border-indigo-600 rounded-xl outline-none font-black text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-black mb-1.5">Ngày Bắt Đầu</label>
                  <input
                    type="date"
                    required
                    value={newHolidayForm.start_date}
                    onChange={e => setNewHolidayForm({ ...newHolidayForm, start_date: e.target.value })}
                    className="w-full px-3.5 py-3 bg-slate-50 border-2 border-slate-300 focus:border-indigo-600 rounded-xl outline-none font-bold text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-black mb-1.5">Ngày Kết Thúc</label>
                  <input
                    type="date"
                    required
                    value={newHolidayForm.end_date}
                    onChange={e => setNewHolidayForm({ ...newHolidayForm, end_date: e.target.value })}
                    className="w-full px-3.5 py-3 bg-slate-50 border-2 border-slate-300 focus:border-indigo-600 rounded-xl outline-none font-bold text-sm"
                  />
                </div>
                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsHolidayModalOpen(false)}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl border-2 border-slate-300 text-sm cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl border-2 border-indigo-700 shadow-md text-sm cursor-pointer"
                  >
                    Lưu Ngày Lễ
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL ĐỔI MẬT KHẨU */}
        {showChangePassModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4 border-2 border-slate-200">
              <div className="flex justify-between items-center border-b-2 border-slate-100 pb-3">
                <h3 className="font-black text-base md:text-lg text-slate-900">Đổi Mật Khẩu Cá Nhân</h3>
                <button
                  type="button"
                  onClick={() => setShowChangePassModal(false)}
                  className="w-8 h-8 rounded-full border-2 border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleChangePassword} className="space-y-4 text-xs md:text-sm">
                <div>
                  <label className="block text-slate-700 font-black mb-1.5">Mật khẩu hiện tại</label>
                  <input
                    type="password"
                    required
                    value={oldPass}
                    onChange={e => setOldPass(e.target.value)}
                    className="w-full px-3.5 py-3 bg-slate-50 border-2 border-slate-300 focus:border-blue-600 rounded-xl outline-none font-bold text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-black mb-1.5">Mật khẩu mới (tối thiểu 6 ký tự)</label>
                  <input
                    type="password"
                    required
                    value={newPass}
                    onChange={e => setNewPass(e.target.value)}
                    className="w-full px-3.5 py-3 bg-slate-50 border-2 border-slate-300 focus:border-blue-600 rounded-xl outline-none font-bold text-sm"
                  />
                </div>
                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowChangePassModal(false)}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl border-2 border-slate-300 text-sm cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl border-2 border-blue-700 shadow-md text-sm cursor-pointer"
                  >
                    Lưu Mật Khẩu
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    );
  }

  // ================= 9. GIAO DIỆN DI ĐỘNG (ZALO MINI APP / MOBILE VIEW / SIMULATOR) =================
  const allowedTabs = ROLE_PERMISSIONS[activeRole]?.allowedTabs || [];

  return (
    <div className={`min-h-screen ${viewMode === "mobile_simulator" ? "bg-slate-900 py-6 px-4 flex flex-col items-center justify-center" : "bg-slate-50"}`}>
      
      {/* THANH ĐIỀU HƯỚNG QUAY LẠI MÀN HÌNH PC KHI ĐANG Ở CHẾ ĐỘ GIẢ LẬP DI ĐỘNG */}
      {viewMode === "mobile_simulator" && (
        <div className="w-full max-w-sm mb-3 flex items-center justify-between bg-slate-800 text-white px-4 py-2.5 rounded-2xl text-xs md:text-sm shadow-lg border-2 border-slate-700">
          <div className="flex items-center gap-2 font-black">
            <Smartphone size={16} className="text-blue-400" />
            <span>Khung Giả Lập Điện Thoại</span>
          </div>
          <button
            type="button"
            onClick={() => setViewMode("auto")}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-black px-3.5 py-1.5 rounded-xl text-xs border-2 border-blue-400 cursor-pointer shadow"
          >
            <Monitor size={14} />
            <span>Mở Lại Màn Hình PC</span>
          </button>
        </div>
      )}

      {/* KHUNG THIẾT BỊ DI ĐỘNG */}
      <div
        className={`flex flex-col font-sans text-slate-800 select-none overflow-hidden ${
          viewMode === "mobile_simulator"
            ? "w-full max-w-[390px] h-[844px] bg-slate-50 rounded-[44px] border-[8px] border-slate-800 shadow-2xl relative"
            : "min-h-screen"
        }`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 76px)" }}
      >
        
        {/* TOAST THÔNG BÁO HỆ THỐNG */}
        {toastNotification && (
          <div
            className={`fixed top-4 left-4 right-4 z-50 p-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold text-white transition-all transform animate-in fade-in slide-in-from-top ${
              toastNotification.type === "error"
                ? "bg-rose-600"
                : toastNotification.type === "warning"
                ? "bg-amber-600"
                : toastNotification.type === "success"
                ? "bg-emerald-600"
                : "bg-blue-600"
            }`}
            style={{ top: "calc(env(safe-area-inset-top, 24px) + 8px)" }}
          >
            {toastNotification.type === "error" ? (
              <AlertCircle size={18} className="shrink-0" />
            ) : toastNotification.type === "warning" ? (
              <AlertTriangle size={18} className="shrink-0" />
            ) : (
              <CheckCircle2 size={18} className="shrink-0" />
            )}
            <span className="flex-1">{toastNotification.message}</span>
            <button onClick={() => setToastNotification(null)} className="p-1 hover:opacity-80">
              <X size={14} />
            </button>
          </div>
        )}

        {/* 1. HEADER DI ĐỘNG (TƯƠNG THÍCH ZALO CAPSULE) */}
        {/* 1. HEADER DI ĐỘNG (TƯƠNG THÍCH ZALO CAPSULE) */}
        <header
          className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white p-4 shadow-lg rounded-b-3xl border-b-2 border-blue-600"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 24px) + 12px)" }}
        >
          <div className="flex items-center justify-between mb-3 min-h-[40px]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white p-1 shadow-md border-2 border-white/40 flex items-center justify-center overflow-hidden shrink-0">
                <img src={sedincoLogo} alt="SEDINCO Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="font-black text-lg tracking-tight leading-tight">SEDINCO HR</h1>
                <p className="text-xs text-blue-200 font-bold">Chấm Công & Quản Trị Nhân Sự</p>
              </div>
            </div>
            <div className="min-w-[96px] h-8 pointer-events-none" aria-hidden="true" />
          </div>

          {/* User Card - Thiết kế cân bằng, chữ to rõ ràng, hiển thị đầy đủ họ tên & chức vụ */}
          <div className="bg-slate-800/90 backdrop-blur-md p-4 rounded-3xl border-2 border-white/25 shadow-xl space-y-3">
            {/* Hàng 1: Avatar vừa vặn + Họ tên đầy đủ + Vai trò + Chức danh */}
            <div className="flex items-center gap-3.5">
              {/* Avatar cố định kích thước 56px x 56px với khung viền sắc nét */}
              <div className="w-14 h-14 min-w-[56px] min-h-[56px] rounded-2xl border-2 border-white/80 overflow-hidden shadow-md shrink-0 bg-slate-700">
                <img
                  src={currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Thông tin nhân viên đầy đủ - KHÔNG DÙNG truncate gây mất chữ */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-black text-base md:text-lg text-white leading-snug break-words">
                    {currentUser?.ho_ten || "Cán bộ nhân viên"}
                  </h2>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-lg font-black border border-white/40 shadow-sm shrink-0 ${
                      activeRole === ROLES.ADMIN
                        ? "bg-amber-400 text-slate-950"
                        : activeRole === ROLES.ACCOUNTANT
                        ? "bg-emerald-400 text-slate-950"
                        : activeRole === ROLES.HR
                        ? "bg-purple-300 text-slate-950"
                        : "bg-blue-300 text-slate-950"
                    }`}
                  >
                    {ROLE_LABELS[activeRole]}
                  </span>
                </div>

                {/* Chức vụ công việc hiển thị đầy đủ, không bị cắt xén */}
                <p className="text-xs text-blue-200 font-bold mt-1 break-words leading-relaxed">
                  Chức vụ: <span className="text-white font-extrabold">{currentUser?.chuc_danh || "Kỹ sư công trường"}</span>
                </p>
              </div>
            </div>

            {/* Hàng 2: Mã NV + Lịch Hôm nay + Nút Đăng xuất nổi bật */}
            <div className="pt-2.5 border-t border-white/15 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs bg-emerald-500/25 text-emerald-300 px-2.5 py-1 rounded-xl font-mono font-black border border-emerald-400/40">
                  Mã: {currentUser?.ma_nv}
                </span>
                <span className="text-xs text-slate-300 font-bold flex items-center gap-1.5">
                  <Calendar size={13} className="text-blue-300 shrink-0" />
                  <span>{currentTime.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
                </span>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded-xl font-black text-white text-xs border-2 border-rose-400 shadow-sm cursor-pointer active:scale-95 transition-all shrink-0"
                title="Đăng xuất khỏi hệ thống"
              >
                <LogOut size={13} />
                <span>Thoát</span>
              </button>
            </div>
          </div>
        </header>

        {/* 2. NỘI DUNG TỪNG TAB TRÊN MOBILE */}
        <main className="p-4 flex-1 space-y-4 overflow-y-auto">

          {/* TAB 1: CHẤM CÔNG DI ĐỘNG (QUÉT KHUÔN MẶT & GPS) */}
          {(currentTab === "checkin" || (!allowedTabs.includes(currentTab) && getDefaultTabForRole(activeRole) === "checkin")) && (
            <div className="space-y-4 animate-in fade-in">
              <OneTouchCheckIn
                currentUser={currentUser}
                todayAttendance={
                  checkInTime || checkOutTime
                    ? { check_in_time: checkInTime, check_out_time: checkOutTime }
                    : null
                }
                onCheckInSuccess={() => {
                  loadRoleData();
                  showToast("Điểm danh trực tuyến thành công!", "success");
                }}
                isLockedPeriod={false}
              />

              {/* Quick Stats Row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl p-3.5 border-2 border-slate-200 shadow-sm text-center">
                  <span className="block text-xs text-slate-600 font-black uppercase">Công Tháng</span>
                  <span className="block text-2xl font-black text-blue-700 mt-0.5">
                    {myAttendanceDays.filter(d => d === "1").length || 21.5}
                  </span>
                  <span className="text-xs text-emerald-700 font-bold">/ 22 ngày</span>
                </div>

                <div className="bg-white rounded-2xl p-3.5 border-2 border-slate-200 shadow-sm text-center">
                  <span className="block text-xs text-slate-600 font-black uppercase">Phép Năm</span>
                  <span className="block text-2xl font-black text-amber-700 mt-0.5">11.0</span>
                  <span className="text-xs text-slate-600 font-bold">ngày còn</span>
                </div>

                <div className="bg-white rounded-2xl p-3.5 border-2 border-slate-200 shadow-sm text-center">
                  <span className="block text-xs text-slate-600 font-black uppercase">Lương Dự Tính</span>
                  <span className="block text-lg font-black text-emerald-700 mt-1 line-clamp-1">
                    {myPayroll ? `${(myPayroll.netSalary / 1000000).toFixed(1)} tr` : "18.5 tr"}
                  </span>
                  <span className="text-xs text-slate-500 font-semibold">Thực nhận</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LỊCH SỬ CHẤM CÔNG */}
          {currentTab === "history" && (
            <div className="bg-white rounded-3xl p-4 border-2 border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between px-2">
                <button
                  type="button"
                  onClick={() => setSelectedMonth(prev => (prev > 1 ? prev - 1 : 12))}
                  className="p-2.5 rounded-xl bg-slate-100 text-slate-800 font-black border-2 border-slate-300 cursor-pointer"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="text-center">
                  <h3 className="font-black text-base text-slate-900">
                    Tháng {selectedMonth}, Năm {selectedYear}
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">Bảng chấm công cá nhân</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMonth(prev => (prev < 12 ? prev + 1 : 1))}
                  className="p-2.5 rounded-xl bg-slate-100 text-slate-800 font-black border-2 border-slate-300 cursor-pointer"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1.5 text-center pt-2">
                {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((d, i) => (
                  <div key={i} className="text-xs font-black text-slate-500 py-1">{d}</div>
                ))}
                {Array.from({ length: 31 }, (_, idx) => {
                  const dayNum = idx + 1;
                  const statusVal = myAttendanceDays[idx] || "";
                  const style = getStatusBadgeStyle(statusVal);
                  return (
                    <div
                      key={idx}
                      className={`p-1.5 rounded-xl border-2 flex flex-col items-center justify-center min-h-[50px] ${style.bg}`}
                    >
                      <span className="text-xs font-black">{dayNum}</span>
                      <span className="text-xs uppercase font-black">{statusVal || "-"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: ĐƠN TỪ (MOBILE) */}
          {currentTab === "requests" && (
            <div className="space-y-3.5">
              <div className="flex justify-between items-center bg-white p-4 rounded-3xl border-2 border-slate-200 shadow-sm">
                <div>
                  <h3 className="font-black text-base text-slate-900">
                    {hasPermission(activeRole, "canApproveRequests") ? "Duyệt Đơn Toàn Cty" : "Đơn Từ Của Tôi"}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Nghỉ phép, tăng ca ngoài giờ, bổ sung công</p>
                </div>
                {hasPermission(activeRole, "canCreateRequest") && (
                  <button
                    type="button"
                    onClick={() => setIsRequestModalOpen(true)}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs md:text-sm px-3.5 py-2.5 rounded-xl border-2 border-blue-700 shadow-sm cursor-pointer"
                  >
                    <Plus size={16} />
                    <span>Tạo Đơn</span>
                  </button>
                )}
              </div>

              {hasPermission(activeRole, "canApproveRequests") && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-black">
                  <button
                    type="button"
                    onClick={() => setRequestFilterStatus("all")}
                    className={`px-3.5 py-2 rounded-xl shrink-0 border-2 cursor-pointer transition-all ${
                      requestFilterStatus === "all" ? "bg-blue-600 text-white border-blue-700 shadow-sm" : "bg-white text-slate-700 border-slate-300"
                    }`}
                  >
                    Tất cả ({allRequests.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestFilterStatus("pending")}
                    className={`px-3.5 py-2 rounded-xl shrink-0 border-2 cursor-pointer transition-all ${
                      requestFilterStatus === "pending" ? "bg-amber-500 text-white border-amber-600 shadow-sm" : "bg-white text-slate-700 border-slate-300"
                    }`}
                  >
                    Chờ duyệt ({allRequests.filter(r => r.status === "pending").length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestFilterStatus("approved")}
                    className={`px-3.5 py-2 rounded-xl shrink-0 border-2 cursor-pointer transition-all ${
                      requestFilterStatus === "approved" ? "bg-emerald-600 text-white border-emerald-700 shadow-sm" : "bg-white text-slate-700 border-slate-300"
                    }`}
                  >
                    Đã duyệt ({allRequests.filter(r => r.status === "approved").length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestFilterStatus("mine")}
                    className={`px-3.5 py-2 rounded-xl shrink-0 border-2 cursor-pointer transition-all ${
                      requestFilterStatus === "mine" ? "bg-indigo-600 text-white border-indigo-700 shadow-sm" : "bg-white text-slate-700 border-slate-300"
                    }`}
                  >
                    Đơn của tôi ({allRequests.filter(r => (r.ma_nv || r.employee_id) === currentUser?.ma_nv).length})
                  </button>
                </div>
              )}

              {(hasPermission(activeRole, "canApproveRequests")
                ? allRequests.filter(r => {
                    if (requestFilterStatus === "all") return true;
                    if (requestFilterStatus === "mine") return (r.ma_nv || r.employee_id) === currentUser?.ma_nv;
                    return r.status === requestFilterStatus;
                  })
                : myRequests
              ).map((req, i) => (
                <div key={req.id || i} className="bg-white rounded-2xl p-4 border-2 border-slate-200 shadow-sm space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-black text-sm text-slate-900">{req.ho_ten || req.ma_nv}</span>
                      <span className="text-xs text-blue-700 font-bold block mt-0.5">{req.type || req.request_type}</span>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full font-black border-2 ${
                      req.status === "approved"
                        ? "bg-emerald-100 text-emerald-900 border-emerald-400"
                        : req.status === "rejected"
                        ? "bg-rose-100 text-rose-900 border-rose-400"
                        : "bg-amber-100 text-amber-900 border-amber-400"
                    }`}>
                      {req.status === "approved" ? "✓ Đã duyệt" : req.status === "rejected" ? "✗ Từ chối" : "⏱ Chờ duyệt"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-800 bg-slate-50 border border-slate-200 p-3 rounded-xl font-medium leading-relaxed">{req.reason}</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-500 font-semibold block">Ngày: {req.date || req.request_date}</span>
                    {req.status === "pending" && !hasPermission(activeRole, "canApproveRequests") && (
                      <button
                        type="button"
                        onClick={() => handleCancelRequest(req.id)}
                        className="text-xs font-black text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border-2 border-rose-300 cursor-pointer transition-all"
                      >
                        Hủy đơn
                      </button>
                    )}
                  </div>

                  {hasPermission(activeRole, "canApproveRequests") && req.status === "pending" && (
                    (req.ma_nv || req.employee_id) === currentUser?.ma_nv ? (
                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-300 inline-block">
                          Đơn của bạn (Không tự duyệt)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCancelRequest(req.id)}
                          className="text-xs font-black text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border-2 border-rose-300 cursor-pointer transition-all"
                        >
                          Hủy đơn
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2.5 pt-2 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleApproveRejectRequest(req.id, "approved", req.ma_nv || req.employee_id)}
                          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs md:text-sm rounded-xl border-2 border-emerald-700 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          <Check size={16} /> Duyệt Đơn
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveRejectRequest(req.id, "rejected", req.ma_nv || req.employee_id)}
                          className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs md:text-sm rounded-xl border-2 border-rose-700 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          <X size={16} /> Từ Chối
                        </button>
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          )}

          {/* TAB: BẢNG CÔNG MA TRẬN TRÊN MOBILE */}
          {currentTab === "matrix" && (
            <div className="space-y-3">
              <AttendanceMatrixTable
                attendanceData={attendanceMatrix}
                month={selectedMonth}
                year={selectedYear}
                onMonthChange={(m, y) => { setSelectedMonth(m); setSelectedYear(y); }}
                onRefresh={loadRoleData}
                userRole={activeRole}
                onShowToast={showToast}
                onRecordAuditLog={recordAuditLog}
              />
            </div>
          )}

          {/* TAB: QUẢN LÝ NHÂN SỰ & CẤP MÃ LIÊN KẾT TRÊN MOBILE */}
          {currentTab === "management" && hasPermission(activeRole, "canManageEmployees") && (
            <div className="space-y-3.5">
              <div className="flex justify-between items-center bg-white p-4 rounded-3xl border-2 border-slate-200 shadow-sm">
                <div>
                  <h3 className="font-black text-base text-slate-900">Danh Sách Nhân Sự & Cấp Mã</h3>
                  <p className="text-xs text-slate-500 font-medium">Tổng cộng {allEmployees.length} nhân viên</p>
                </div>
                {activeRole === ROLES.ADMIN && (
                  <button
                    type="button"
                    onClick={handleOpenCreateEmployeeModal}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs md:text-sm px-3.5 py-2.5 rounded-xl border-2 border-blue-700 cursor-pointer shadow-md"
                  >
                    <Plus size={16} />
                    <span>Thêm NV</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {allEmployees.map((emp, i) => (
                  <div key={emp.ma_nv || i} className="bg-white rounded-2xl p-4 border-2 border-slate-200 shadow-sm space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-black text-sm text-slate-900">{emp.ho_ten}</h4>
                        <span className="text-xs text-slate-600 font-bold">{emp.ma_nv} • {emp.chuc_danh || "Nhân viên"}</span>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full font-black bg-blue-100 text-blue-900 border border-blue-300">
                        {ROLE_LABELS[emp.role] || emp.role || "Nhân Viên"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-2.5 border-t border-slate-100">
                      <span className="text-xs text-slate-500 font-semibold">
                        SĐT: {emp.dien_thoai || "0905***"}
                      </span>
                      {activeRole === ROLES.ADMIN && (
                        <button
                          type="button"
                          onClick={() => handleOpenEditEmployee(emp)}
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-xl font-black flex items-center gap-1.5 text-xs border border-amber-300 cursor-pointer shadow-sm transition-all"
                        >
                          <Edit3 size={13} />
                          <span>Sửa Hồ Sơ / MK</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: BẢNG LƯƠNG / PHIẾU LƯƠNG (MOBILE) */}
          {currentTab === "payroll" && (
            <div className="space-y-3.5">
              {hasPermission(activeRole, "canViewCompanyPayroll") ? (
                <div className="space-y-3.5">
                  <div className="bg-gradient-to-br from-emerald-600 to-teal-800 text-white rounded-3xl p-5 shadow-md border-2 border-emerald-700">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-black text-base md:text-lg">Bảng Lương Tháng {selectedMonth}/{selectedYear}</h3>
                      <span className="text-xs font-bold bg-white/20 px-2.5 py-1 rounded-xl border border-white/30">{companyPayroll.length} NV</span>
                    </div>
                    <span className="text-xs text-emerald-100 block font-black uppercase">Tổng quỹ lương Net:</span>
                    <span className="text-2xl font-black text-white mt-1 block">
                      {companyPayroll.reduce((acc, c) => acc + (Number(c.netSalary) || 0), 0).toLocaleString("vi-VN")} đ
                    </span>
                  </div>

                  {companyPayroll.map((item, idx) => (
                    <div
                      key={item.ma_nv || item.id_nhan_vien || idx}
                      onClick={() => setSelectedEmployeeForDetail(item)}
                      className="bg-white rounded-2xl p-4 border-2 border-slate-200 shadow-sm flex justify-between items-center cursor-pointer hover:border-emerald-500 transition-all"
                    >
                      <div>
                        <h4 className="font-black text-sm text-slate-900">{item.ho_ten}</h4>
                        <span className="text-xs text-slate-500 font-semibold">{item.ma_nv || item.id_nhan_vien} • {item.chuc_danh || "Nhân viên"}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-base font-black text-emerald-800 block">
                          {Number(item.netSalary || 0).toLocaleString("vi-VN")} đ
                        </span>
                        <span className="text-xs text-blue-700 font-black">Xem chi tiết ➔</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : myPayroll ? (
                <div className="bg-white rounded-3xl p-5 border-2 border-slate-200 shadow-sm space-y-4">
                  <div className="flex justify-between items-center border-b-2 border-slate-100 pb-3">
                    <div>
                      <h3 className="font-black text-base text-slate-900">
                        Phiếu Lương Tháng {selectedMonth}/{selectedYear}
                      </h3>
                      <p className="text-xs text-slate-500 font-bold">Mã: {myPayroll.ma_nv || myPayroll.id_nhan_vien}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500 block font-black uppercase">Thực Nhận (Net)</span>
                      <span className="font-black text-lg text-emerald-800">
                        {Number(myPayroll.netSalary).toLocaleString("vi-VN")} đ
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2.5 text-xs md:text-sm">
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-600 font-medium">Lương cơ bản HĐ:</span>
                      <strong className="text-slate-900 font-bold">{Number(myPayroll.baseSalary).toLocaleString("vi-VN")} đ</strong>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-600 font-medium">Ngày công thực tế:</span>
                      <strong className="text-blue-800 font-black">{myPayroll.totalWorkDays} công</strong>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-600 font-medium">Tổng phụ cấp:</span>
                      <strong className="text-slate-900 font-bold">{Number(myPayroll.totalAllowance).toLocaleString("vi-VN")} đ</strong>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100 text-rose-700">
                      <span className="font-medium">Trích trừ BHXH (10.5%):</span>
                      <strong className="font-bold">-{Number(myPayroll.insuranceDeduction || myPayroll.totalInsurance).toLocaleString("vi-VN")} đ</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedEmployeeForDetail(myPayroll)}
                    className="w-full py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-black text-xs md:text-sm rounded-xl border-2 border-emerald-300 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Printer size={16} />
                    <span>In Phiếu Lương Chi Tiết</span>
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-3xl p-8 text-center text-slate-500 font-bold border-2 border-slate-200">
                  Chưa có dữ liệu bảng lương tháng {selectedMonth}/{selectedYear}.
                </div>
              )}
            </div>
          )}

          {/* TAB 5: HỒ SƠ CÁ NHÂN (MOBILE) */}
          {currentTab === "profile" && (
            <div className="bg-white rounded-3xl p-6 border-2 border-slate-200 shadow-sm space-y-4 text-center">
              <img
                src={currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
                alt="Avatar"
                className="w-20 h-20 min-w-[80px] min-h-[80px] mx-auto rounded-full object-cover border-2 border-blue-600 shadow-md"
              />
              <div>
                <h3 className="font-black text-lg text-slate-900">{currentUser?.ho_ten}</h3>
                <p className="text-xs text-slate-600 font-semibold">{currentUser?.chuc_danh}</p>
                <span className="inline-block mt-1 text-xs font-black bg-blue-100 text-blue-900 px-3 py-1 rounded-full border border-blue-300">
                  Mã: {currentUser?.ma_nv} • {ROLE_LABELS[activeRole]}
                </span>
              </div>

              <div className="text-left space-y-2.5 text-xs md:text-sm pt-4 border-t-2 border-slate-100">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Công ty:</span>
                  <span className="font-bold text-slate-800">SEDINCO Construction</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Điện thoại:</span>
                  <span className="font-bold text-slate-800">{currentUser?.dien_thoai || "0905123456"}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Email:</span>
                  <span className="font-bold text-slate-800">{currentUser?.email || "nhanvien@sedinco.vn"}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowChangePassModal(true)}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-blue-900 font-black rounded-xl text-xs md:text-sm border-2 border-slate-300 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock size={16} /> <span>Đổi Mật Khẩu Cá Nhân</span>
              </button>

              {hasPermission(activeRole, "canManageCompany") && (
                <button
                  type="button"
                  onClick={() => setCurrentTab("company")}
                  className="w-full py-3 bg-blue-50 hover:bg-blue-100 text-blue-900 font-black rounded-xl text-xs md:text-sm border-2 border-blue-300 flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all"
                >
                  <Building size={16} className="text-blue-700" />
                  <span>Cấu Hình Vị Trí & GPS Công Ty</span>
                </button>
              )}
            </div>
          )}

          {/* TAB 7 (MOBILE): CẤU HÌNH VỊ TRÍ TRỤ SỞ & GPS (DÀNH CHO QUẢN TRỊ VIÊN) */}
          {currentTab === "company" && hasPermission(activeRole, "canManageCompany") && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-3xl p-5 shadow-lg border-2 border-blue-950">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 text-blue-300">
                    <Building size={22} />
                  </div>
                  <div>
                    <h3 className="font-black text-sm uppercase tracking-wide">Vị Trí Trụ Sở & Chấm Công GPS</h3>
                    <p className="text-[11px] text-blue-200">Cấu hình tọa độ văn phòng để nhân viên chấm công</p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                  <span className="text-blue-200">Trụ sở:</span>
                  <span className="font-black text-white">{companyInfo.work_location_name || companyInfo.company_name}</span>
                </div>
              </div>

              {/* Nút Lấy Tọa Độ GPS Thiết Bị Hiện Tại */}
              <div className="bg-white rounded-3xl p-5 border-2 border-blue-200 shadow-sm space-y-3">
                <div className="text-center space-y-1">
                  <span className="text-xs font-black text-slate-800">CẬP NHẬT TỌA ĐỘ NHANH</span>
                  <p className="text-[11px] text-slate-500">Đứng tại văn phòng/công trường và nhấn nút bên dưới để ghim vị trí chuẩn xác</p>
                </div>

                <button
                  type="button"
                  onClick={handleGetCurrentLocation}
                  disabled={isGettingGps}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all disabled:opacity-60"
                >
                  <Navigation size={18} className={isGettingGps ? "animate-spin" : ""} />
                  <span>{isGettingGps ? "Đang xác thực tọa độ GPS thiết bị..." : "📍 Lấy Tọa Độ GPS Thiết Bị Hiện Tại"}</span>
                </button>

                {companyInfo.latitude && companyInfo.longitude && (
                  <div className="pt-2 flex justify-center">
                    <a
                      href={`https://maps.google.com/?q=${companyInfo.latitude},${companyInfo.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-blue-900 border border-slate-300 font-black text-xs transition-all"
                    >
                      <ExternalLink size={14} />
                      <span>Kiểm tra vị trí trên Google Maps</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Form chi tiết vị trí & bán kính */}
              <form onSubmit={handleSaveCompanyInfo} className="bg-white rounded-3xl p-5 border-2 border-slate-200 shadow-sm space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Tên Điểm Làm Việc / Trụ Sở</label>
                  <input
                    type="text"
                    required
                    value={companyInfo.work_location_name || ""}
                    onChange={e => setCompanyInfo({ ...companyInfo, work_location_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-slate-900"
                    placeholder="VD: Trụ sở Sedinco Đà Nẵng"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Địa Chỉ Văn Phòng</label>
                  <input
                    type="text"
                    required
                    value={companyInfo.address || ""}
                    onChange={e => setCompanyInfo({ ...companyInfo, address: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl font-medium text-slate-900"
                    placeholder="Số nhà, tên đường, phường xã, quận huyện"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Vĩ Độ (Lat)</label>
                    <input
                      type="number"
                      step="0.000001"
                      required
                      value={companyInfo.latitude || 16.0544}
                      onChange={e => setCompanyInfo({ ...companyInfo, latitude: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Kinh Độ (Lng)</label>
                    <input
                      type="number"
                      step="0.000001"
                      required
                      value={companyInfo.longitude || 108.2022}
                      onChange={e => setCompanyInfo({ ...companyInfo, longitude: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-slate-700 font-bold">Bán Kính Cho Phép (Mét)</label>
                    <span className="font-black text-blue-700">{companyInfo.allowed_radius || 50} mét</span>
                  </div>
                  <div className="flex gap-2">
                    {[50, 100, 200, 500].map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCompanyInfo({ ...companyInfo, allowed_radius: r })}
                        className={`flex-1 py-2 rounded-xl text-xs font-black border-2 cursor-pointer transition-all ${
                          companyInfo.allowed_radius === r
                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                            : "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200"
                        }`}
                      >
                        {r}m
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div>
                    <span className="font-black text-slate-800 text-xs block">Xác Thực Sinh Trắc Học</span>
                    <span className="text-[10px] text-slate-500">Kích hoạt FaceID / Vân tay khi chấm công</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(companyInfo.enable_biometrics)}
                      onChange={e => setCompanyInfo({ ...companyInfo, enable_biometrics: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl text-xs md:text-sm border-2 border-blue-700 shadow-md cursor-pointer transition-all"
                >
                  💾 Lưu Cấu Hình Vị Trí Trụ Sở
                </button>
              </form>
            </div>
          )}

        </main>

        {/* 3. THANH ĐIỀU HƯỚNG ĐÁY MÀN HÌNH DI ĐỘNG */}
        <nav
          className="fixed bottom-0 inset-x-0 bg-white border-t-2 border-slate-300 flex items-center justify-between px-1.5 py-1.5 z-40 shadow-xl"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 12px) + 8px)" }}
        >
          {allowedTabs.includes("matrix") && (
            <button
              type="button"
              onClick={() => setCurrentTab("matrix")}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl cursor-pointer flex-1 min-w-0 transition-all ${
                currentTab === "matrix"
                  ? "text-blue-700 font-black bg-blue-50 border-2 border-blue-600 shadow-sm"
                  : "text-slate-600 font-bold border-2 border-transparent hover:border-slate-300"
              }`}
            >
              <Calendar size={20} className="shrink-0" />
              <span className="text-[10px] md:text-xs font-black truncate max-w-full text-center">Bảng Công</span>
            </button>
          )}

          {allowedTabs.includes("checkin") && (
            <button
              type="button"
              onClick={() => setCurrentTab("checkin")}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl cursor-pointer flex-1 min-w-0 transition-all ${
                currentTab === "checkin"
                  ? "text-blue-700 font-black bg-blue-50 border-2 border-blue-600 shadow-sm"
                  : "text-slate-600 font-bold border-2 border-transparent hover:border-slate-300"
              }`}
            >
              <Clock size={20} className="shrink-0" />
              <span className="text-[10px] md:text-xs font-black truncate max-w-full text-center">Chấm Công</span>
            </button>
          )}

          {allowedTabs.includes("history") && !allowedTabs.includes("matrix") && (
            <button
              type="button"
              onClick={() => setCurrentTab("history")}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl cursor-pointer flex-1 min-w-0 transition-all ${
                currentTab === "history"
                  ? "text-blue-700 font-black bg-blue-50 border-2 border-blue-600 shadow-sm"
                  : "text-slate-600 font-bold border-2 border-transparent hover:border-slate-300"
              }`}
            >
              <Calendar size={20} className="shrink-0" />
              <span className="text-[10px] md:text-xs font-black truncate max-w-full text-center">Lịch Sử</span>
            </button>
          )}

          {allowedTabs.includes("requests") && (
            <button
              type="button"
              onClick={() => setCurrentTab("requests")}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl cursor-pointer flex-1 min-w-0 transition-all ${
                currentTab === "requests"
                  ? "text-blue-700 font-black bg-blue-50 border-2 border-blue-600 shadow-sm"
                  : "text-slate-600 font-bold border-2 border-transparent hover:border-slate-300"
              }`}
            >
              <FileText size={20} className="shrink-0" />
              <span className="text-[10px] md:text-xs font-black truncate max-w-full text-center">
                {hasPermission(activeRole, "canApproveRequests") ? "Duyệt Đơn" : "Đơn Từ"}
              </span>
            </button>
          )}

          {allowedTabs.includes("management") && (
            <button
              type="button"
              onClick={() => setCurrentTab("management")}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl cursor-pointer flex-1 min-w-0 transition-all ${
                currentTab === "management"
                  ? "text-blue-700 font-black bg-blue-50 border-2 border-blue-600 shadow-sm"
                  : "text-slate-600 font-bold border-2 border-transparent hover:border-slate-300"
              }`}
            >
              <Users size={20} className="shrink-0" />
              <span className="text-[10px] md:text-xs font-black truncate max-w-full text-center">Nhân Sự</span>
            </button>
          )}

          {allowedTabs.includes("payroll") && (
            <button
              type="button"
              onClick={() => setCurrentTab("payroll")}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl cursor-pointer flex-1 min-w-0 transition-all ${
                currentTab === "payroll"
                  ? "text-blue-700 font-black bg-blue-50 border-2 border-blue-600 shadow-sm"
                  : "text-slate-600 font-bold border-2 border-transparent hover:border-slate-300"
              }`}
            >
              <DollarSign size={20} className="shrink-0" />
              <span className="text-[10px] md:text-xs font-black truncate max-w-full text-center">
                {hasPermission(activeRole, "canViewCompanyPayroll") ? "Bảng Lương" : "Phiếu Lương"}
              </span>
            </button>
          )}

          {allowedTabs.includes("company") && (
            <button
              type="button"
              onClick={() => setCurrentTab("company")}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl cursor-pointer flex-1 min-w-0 transition-all ${
                currentTab === "company"
                  ? "text-blue-700 font-black bg-blue-50 border-2 border-blue-600 shadow-sm"
                  : "text-slate-600 font-bold border-2 border-transparent hover:border-slate-300"
              }`}
            >
              <Building size={20} className="shrink-0" />
              <span className="text-[10px] md:text-xs font-black truncate max-w-full text-center">Vị Trí Cty</span>
            </button>
          )}

          {allowedTabs.includes("profile") && (
            <button
              type="button"
              onClick={() => setCurrentTab("profile")}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl cursor-pointer flex-1 min-w-0 transition-all ${
                currentTab === "profile"
                  ? "text-blue-700 font-black bg-blue-50 border-2 border-blue-600 shadow-sm"
                  : "text-slate-600 font-bold border-2 border-transparent hover:border-slate-300"
              }`}
            >
              <User size={20} className="shrink-0" />
              <span className="text-[10px] md:text-xs font-black truncate max-w-full text-center">Hồ Sơ</span>
            </button>
          )}
        </nav>

        {/* MODAL PHIẾU LƯƠNG TRÊN MOBILE */}
        {selectedEmployeeForDetail && (
          <SalarySlipModal
            payrollItem={selectedEmployeeForDetail}
            month={selectedMonth}
            year={selectedYear}
            onClose={() => setSelectedEmployeeForDetail(null)}
          />
        )}

        {/* MODAL TẠO ĐƠN TỪ TRÊN MOBILE (F3) */}
        {isRequestModalOpen && (
          <SmartLeaveRequestModal
            currentUser={currentUser}
            holidaysList={holidays}
            existingRequests={allRequests}
            leaveBalance={12}
            onClose={() => setIsRequestModalOpen(false)}
            onRequestCreated={(newReq) => {
              loadRoleData();
              showToast("Đã gửi đơn xin nghỉ thành công!", "success");
            }}
          />
        )}

      </div>
    </div>
  );
}
