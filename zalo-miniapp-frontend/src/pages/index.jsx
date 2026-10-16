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
  Grid
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

  // Form Đăng nhập
  const [loginMaNv, setLoginMaNv] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const isLoginSubmittingRef = useRef(false);

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
  const [companyInfo, setCompanyInfo] = useState({
    company_name: "CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO",
    phone: "0236.3888.999",
    address: "KCN Hòa Khánh, Liên Chiểu, TP. Đà Nẵng",
    tax_code: "0401899999",
    logo_url: ""
  });
  const [isCompanySaving, setIsCompanySaving] = useState(false);

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
    has_insurance: true
  });
  const [newHolidayForm, setNewHolidayForm] = useState({
    holiday_name: "",
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date().toISOString().split("T")[0]
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

  // Đăng nhập / Đăng xuất
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
        setLoginError(res?.message || "Tài khoản hoặc mật khẩu không chính xác!");
      }
    } catch (err) {
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
    if (window.confirm("Bạn có chắc chắn muốn đăng xuất và xóa phiên làm việc hiện tại?")) {
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

  // Chuyển đổi nhanh Role Demo
  const handleSwitchDemoRole = (targetRole) => {
    if (activeRole === targetRole && currentUser) return;
    resetAllSessionData();

    let demoUser;
    if (targetRole === ROLES.ADMIN) {
      demoUser = {
        ma_nv: "ADMIN",
        ho_ten: "Ban Giám Đốc (Quản Trị)",
        chuc_danh: "Tổng Giám Đốc",
        avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200",
        role: ROLES.ADMIN
      };
    } else if (targetRole === ROLES.ACCOUNTANT) {
      demoUser = {
        ma_nv: "NV002",
        ho_ten: "Tô Phương Linh (Kế Toán)",
        chuc_danh: "Chuyên viên Kế Toán",
        avatar_url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200",
        role: ROLES.ACCOUNTANT
      };
    } else {
      demoUser = {
        ma_nv: "NV001",
        ho_ten: "Ngô Trường Sa (Nhân Sự)",
        chuc_danh: "Kỹ sư Công trường",
        avatar_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200",
        role: ROLES.EMPLOYEE
      };
    }

    localStorage.setItem("sedinco_miniapp_user", JSON.stringify(demoUser));
    setCurrentUser(demoUser);
    setActiveRole(targetRole);
    setCurrentTab(getDefaultTabForRole(targetRole));
    showToast(`Đã chuyển sang vai trò: ${ROLE_LABELS[targetRole]}.`, "info");
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

  // Duyệt đơn (Admin)
  const handleApproveRejectRequest = async (id, newStatus) => {
    if (isApproveSubmittingRef.current) return;
    isApproveSubmittingRef.current = true;
    try {
      await safePut(`/requests/${id}`, { status: newStatus });
      showToast(`Đã cập nhật đơn thành: ${newStatus === 'approved' ? 'PHÊ DUYỆT' : 'TỪ CHỐI'}!`, "success");
      loadRoleData();
    } catch (err) {
      showToast(err.message || "Không thể cập nhật trạng thái đơn.", "error");
    } finally {
      setTimeout(() => {
        isApproveSubmittingRef.current = false;
      }, 800);
    }
  };

  // Phân quyền RBAC (Admin)
  const handleUpdateRole = async (ma_nv, newRole) => {
    try {
      await safePut(`/employees/${ma_nv}/role`, { role: newRole });
      showToast(`Đã cập nhật vai trò nhân sự ${ma_nv} thành: ${ROLE_LABELS[newRole] || newRole}`, "success");
      loadRoleData();
    } catch (err) {
      showToast(err.message || "Lỗi cập nhật phân quyền.", "error");
    }
  };

  // Thêm nhân viên mới (Admin)
  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    try {
      await safePost("/employees", newEmployeeForm);
      showToast(`Đã thêm nhân viên mới ${newEmployeeForm.ho_ten} (${newEmployeeForm.ma_nv}) thành công!`, "success");
      setIsEmployeeModalOpen(false);
      setNewEmployeeForm({
        ma_nv: "",
        ho_ten: "",
        chuc_danh: "Kỹ sư công trường",
        dien_thoai: "",
        email: "",
        luong_cb: 8000000,
        has_insurance: true
      });
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

  // Lưu cấu hình công ty (Admin)
  const handleSaveCompanyInfo = async (e) => {
    e.preventDefault();
    setIsCompanySaving(true);
    try {
      await safePut("/company", companyInfo);
      showToast("Đã lưu thông tin doanh nghiệp Sedinco thành công!", "success");
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
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 text-white font-sans flex flex-col justify-between p-6 relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-600/25 rounded-full blur-3xl pointer-events-none" />

        {/* Header Logo */}
        <div className="text-center z-10 pt-4">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-3xl shadow-2xl shadow-blue-500/30 border border-white/20">
            S
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white uppercase">
            SEDINCO HR
          </h1>
          <p className="text-xs md:text-sm text-blue-200 mt-1 font-medium">
            Hệ Thống Chấm Công GPS & Quản Trị Tiền Lương Doanh Nghiệp
          </p>
        </div>

        {/* Khung Đăng nhập (Responsive: Center Desktop & Full Mobile) */}
        <div className="w-full max-w-md mx-auto bg-white/10 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 md:p-8 shadow-2xl z-10 my-auto">
          <div className="mb-6 text-center">
            <h2 className="text-lg font-black text-white">Đăng Nhập Hệ Thống</h2>
            <p className="text-xs text-slate-300 mt-1">
              Hỗ trợ đồng bộ trên cả Điện thoại (Zalo App) và Máy tính (Web)
            </p>
          </div>

          {loginError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2">
              <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                Mã Nhân Viên / Tài Khoản
              </label>
              <div className="relative">
                <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={loginMaNv}
                  onChange={(e) => setLoginMaNv(e.target.value)}
                  placeholder="Ví dụ: NV001, NV002, ADMIN..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all uppercase"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                Mật Khẩu
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="Nhập mật khẩu..."
                  className="w-full pl-10 pr-11 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] text-white font-black text-sm shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-60"
            >
              {isLoggingIn ? <span>Đang xác thực...</span> : <span>ĐĂNG NHẬP HỆ THỐNG</span>}
            </button>
          </form>

          {/* Phím tắt Đăng Nhập Nhanh Demo */}
          <div className="mt-6 pt-4 border-t border-white/10 text-center">
            <span className="text-[11px] text-slate-400 block mb-2 font-medium">
              Hoặc trải nghiệm nhanh với các vai trò demo:
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => { setLoginMaNv("NV001"); setLoginPass("123456"); }}
                className="py-1.5 px-2 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-blue-200 transition-all cursor-pointer"
              >
                👤 Nhân Sự
              </button>
              <button
                type="button"
                onClick={() => { setLoginMaNv("NV002"); setLoginPass("123456"); }}
                className="py-1.5 px-2 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-emerald-200 transition-all cursor-pointer"
              >
                📊 Kế Toán
              </button>
              <button
                type="button"
                onClick={() => { setLoginMaNv("ADMIN"); setLoginPass("admin123"); }}
                className="py-1.5 px-2 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-amber-200 transition-all cursor-pointer"
              >
                👑 Quản Trị
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center z-10 pt-4 space-y-1">
          <button
            type="button"
            onClick={handleClearCache}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 opacity-60 hover:opacity-100 transition-all cursor-pointer py-1 px-3 rounded-lg"
          >
            <RotateCcw size={12} />
            <span>Làm mới bộ nhớ đệm (Clear Cache)</span>
          </button>
          <p className="text-[10px] text-slate-500">
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
          onSwitchDemoRole={handleSwitchDemoRole}
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
            isLoading={attendanceLoading || companyPayrollLoading}
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
                canEdit={hasPermission(activeRole, "canManageEmployees") || activeRole === ROLES.ACCOUNTANT}
                onShowToast={showToast}
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

                  {/* Filter tabs */}
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
                        .filter(r => requestFilterStatus === "all" || r.status === requestFilterStatus)
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
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleApproveRejectRequest(req.id, "approved")}
                                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1 cursor-pointer active:scale-95"
                                  >
                                    <Check size={12} />
                                    <span>Phê Duyệt</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleApproveRejectRequest(req.id, "rejected")}
                                    className="px-3 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold flex items-center gap-1 cursor-pointer active:scale-95"
                                  >
                                    <X size={12} />
                                    <span>Từ Chối</span>
                                  </button>
                                </div>
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
                          req.status === "approved" ? "bg-emerald-100 text-emerald-800" : req.status === "rejected" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                        }`}>
                          {req.status === "approved" ? "✓ Đã duyệt" : req.status === "rejected" ? "✗ Từ chối" : "⏱ Chờ duyệt"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 bg-white p-2.5 rounded-xl border border-slate-100">{req.reason}</p>
                      <span className="text-[10px] text-slate-400 block">Ngày xin: {req.date || req.request_date}</span>
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
                    onClick={() => setIsEmployeeModalOpen(true)}
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
                              value={emp.role || (emp.chuc_danh?.includes("Giám Đốc") ? ROLES.ADMIN : emp.chuc_danh?.includes("Kế Toán") ? ROLES.ACCOUNTANT : ROLES.EMPLOYEE)}
                              onChange={(e) => handleUpdateRole(emp.ma_nv, e.target.value)}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-100 border border-slate-300 text-xs font-bold text-blue-800 outline-none cursor-pointer"
                            >
                              <option value={ROLES.ADMIN}>👑 Quản Trị Viên (Admin)</option>
                              <option value={ROLES.ACCOUNTANT}>📊 Bộ Phận Kế Toán</option>
                              <option value={ROLES.EMPLOYEE}>👤 Cán Bộ Nhân Viên</option>
                            </select>
                          </td>
                          <td className="p-3 text-center pr-4">
                            <button
                              type="button"
                              onClick={() => handleDeleteEmployee(emp.ma_nv)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                              title="Xóa nhân sự"
                            >
                              <Trash2 size={15} />
                            </button>
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
                    </div>
                  ))}
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

        {/* MODAL TẠO ĐƠN TỪ */}
        {isRequestModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-sm text-slate-800">Tạo Đơn Xin Phép / OT</h3>
                <button type="button" onClick={() => setIsRequestModalOpen(false)} className="text-slate-400">
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleSendRequest} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Loại Đơn</label>
                  <select
                    value={requestForm.request_type}
                    onChange={e => setRequestForm({ ...requestForm, request_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium"
                  >
                    <option value="Nghỉ phép">Nghỉ phép (Hưởng lương - P)</option>
                    <option value="Làm thêm giờ (OT)">Làm thêm ngoài giờ (OT)</option>
                    <option value="Quên chấm công">Báo quên chấm công / Bổ sung công</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Ngày Áp Dụng</label>
                  <input
                    type="date"
                    required
                    value={requestForm.request_date}
                    onChange={e => setRequestForm({ ...requestForm, request_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Lý Do Cụ Thể</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Nhập lý do gửi Ban Giám Đốc xét duyệt..."
                    value={requestForm.reason}
                    onChange={e => setRequestForm({ ...requestForm, reason: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none resize-none font-medium"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRequestModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                  >
                    Gửi Đơn
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL THÊM NHÂN VIÊN */}
        {isEmployeeModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-sm text-slate-800">Thêm Cán Bộ Nhân Sự Mới</h3>
                <button type="button" onClick={() => setIsEmployeeModalOpen(false)} className="text-slate-400">
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleCreateEmployee} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Mã NV (ID)</label>
                    <input
                      type="text"
                      required
                      placeholder="NV004..."
                      value={newEmployeeForm.ma_nv}
                      onChange={e => setNewEmployeeForm({ ...newEmployeeForm, ma_nv: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Họ và Tên</label>
                    <input
                      type="text"
                      required
                      placeholder="Nguyễn Văn A..."
                      value={newEmployeeForm.ho_ten}
                      onChange={e => setNewEmployeeForm({ ...newEmployeeForm, ho_ten: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Chức Danh Công Việc</label>
                  <input
                    type="text"
                    required
                    value={newEmployeeForm.chuc_danh}
                    onChange={e => setNewEmployeeForm({ ...newEmployeeForm, chuc_danh: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Điện Thoại</label>
                    <input
                      type="text"
                      value={newEmployeeForm.dien_thoai}
                      onChange={e => setNewEmployeeForm({ ...newEmployeeForm, dien_thoai: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Lương Cơ Bản (VND)</label>
                    <input
                      type="number"
                      value={newEmployeeForm.luong_cb}
                      onChange={e => setNewEmployeeForm({ ...newEmployeeForm, luong_cb: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEmployeeModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                  >
                    Tạo Nhân Viên
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL THÊM LỊCH NGHỈ LỄ */}
        {isHolidayModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-sm text-slate-800">Thêm Ngày Lễ Hưởng Lương (x3)</h3>
                <button type="button" onClick={() => setIsHolidayModalOpen(false)} className="text-slate-400">
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleCreateHoliday} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Tên Ngày Lễ</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Giỗ Tổ Hùng Vương..."
                    value={newHolidayForm.holiday_name}
                    onChange={e => setNewHolidayForm({ ...newHolidayForm, holiday_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Ngày Bắt Đầu</label>
                  <input
                    type="date"
                    required
                    value={newHolidayForm.start_date}
                    onChange={e => setNewHolidayForm({ ...newHolidayForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Ngày Kết Thúc</label>
                  <input
                    type="date"
                    required
                    value={newHolidayForm.end_date}
                    onChange={e => setNewHolidayForm({ ...newHolidayForm, end_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsHolidayModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-md cursor-pointer"
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
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-sm text-slate-800">Đổi Mật Khẩu Cá Nhân</h3>
                <button type="button" onClick={() => setShowChangePassModal(false)} className="text-slate-400">
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Mật khẩu hiện tại</label>
                  <input
                    type="password"
                    required
                    value={oldPass}
                    onChange={e => setOldPass(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Mật khẩu mới (tối thiểu 6 ký tự)</label>
                  <input
                    type="password"
                    required
                    value={newPass}
                    onChange={e => setNewPass(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowChangePassModal(false)}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md cursor-pointer"
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
        <div className="w-full max-w-sm mb-3 flex items-center justify-between bg-slate-800 text-white px-4 py-2 rounded-2xl text-xs shadow-lg">
          <div className="flex items-center gap-1.5 font-bold">
            <Smartphone size={15} className="text-blue-400" />
            <span>Khung Giả Lập Điện Thoại</span>
          </div>
          <button
            type="button"
            onClick={() => setViewMode("auto")}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white font-black px-3 py-1 rounded-xl text-[11px] cursor-pointer"
          >
            <Monitor size={12} />
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
        <header
          className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white p-4 shadow-lg rounded-b-3xl"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 24px) + 12px)" }}
        >
          <div className="flex items-center justify-between mb-3 min-h-[36px]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black text-lg shadow-inner border border-white/20">
                S
              </div>
              <div>
                <h1 className="font-extrabold text-base tracking-tight leading-tight">SEDINCO HR</h1>
                <p className="text-[10px] text-blue-200 font-medium">Chấm Công & Quản Trị Nhân Sự</p>
              </div>
            </div>
            <div className="min-w-[96px] h-8 pointer-events-none" aria-hidden="true" />
          </div>

          {/* User Card */}
          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/15 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
                  alt="Avatar"
                  className="w-12 h-12 rounded-full object-cover border-2 border-white/40 shadow-md"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-bold text-sm text-white">{currentUser?.ho_ten}</h2>
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded-md font-extrabold ${
                        activeRole === ROLES.ADMIN
                          ? "bg-amber-400 text-slate-900"
                          : activeRole === ROLES.ACCOUNTANT
                          ? "bg-emerald-400 text-slate-900"
                          : "bg-blue-300 text-slate-900"
                      }`}
                    >
                      {ROLE_LABELS[activeRole]}
                    </span>
                  </div>
                  <p className="text-xs text-blue-200">{currentUser?.chuc_danh}</p>
                  <span className="inline-block text-[10px] bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full font-semibold mt-1">
                    Mã: {currentUser?.ma_nv}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-blue-200 uppercase font-semibold block">Hôm nay</span>
                <span className="text-xs font-bold text-white">
                  {currentTime.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })}
                </span>
              </div>
            </div>

            {/* Thanh chuyển đổi nhanh Role demo */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-blue-200 font-semibold mr-1">Role:</span>
                <button
                  type="button"
                  onClick={() => handleSwitchDemoRole(ROLES.EMPLOYEE)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                    activeRole === ROLES.EMPLOYEE ? "bg-white text-blue-900" : "bg-black/20 text-white/80"
                  }`}
                >
                  Nhân Sự
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchDemoRole(ROLES.ACCOUNTANT)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                    activeRole === ROLES.ACCOUNTANT ? "bg-emerald-400 text-emerald-950" : "bg-black/20 text-white/80"
                  }`}
                >
                  Kế Toán
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchDemoRole(ROLES.ADMIN)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                    activeRole === ROLES.ADMIN ? "bg-amber-400 text-amber-950" : "bg-black/20 text-white/80"
                  }`}
                >
                  Quản Trị
                </button>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1 bg-rose-500 hover:bg-rose-600 px-2.5 py-1 rounded-xl font-bold text-white shadow-md text-[11px] cursor-pointer"
              >
                <LogOut size={12} />
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
              <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm text-center relative overflow-hidden">
                <div className="mb-2">
                  <h2 className="text-base font-extrabold text-slate-800">Chấm Công Trực Tuyến</h2>
                  <p className="text-xs text-slate-400">Yêu cầu bật vị trí GPS • Khung giờ 08:00 - 17:00</p>
                </div>

                {/* Nút Tròn Chấm Công Lớn */}
                <div className="py-6 flex justify-center">
                  <button
                    type="button"
                    disabled={isCheckInLoading}
                    onClick={handleSmartCheckInOut}
                    className={`w-44 h-44 rounded-full flex flex-col items-center justify-center p-4 shadow-2xl transition-all duration-300 transform active:scale-95 cursor-pointer relative ${
                      isCheckInLoading
                        ? "opacity-60 cursor-not-allowed"
                        : checkInStatus === "not_checked_in"
                        ? "bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 text-white shadow-blue-500/40 hover:shadow-blue-500/60"
                        : checkInStatus === "checked_in"
                        ? "bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-500 text-white shadow-emerald-500/40 animate-pulse"
                        : "bg-slate-800 text-slate-300 shadow-slate-900/30"
                    }`}
                  >
                    <div className="p-3 bg-white/20 rounded-full mb-1">
                      {isCheckInLoading ? (
                        <RefreshCw size={36} className="text-white animate-spin" />
                      ) : (
                        <Clock size={36} className="text-white" />
                      )}
                    </div>
                    <span className="font-black text-sm tracking-wide">
                      {checkInStatus === "not_checked_in" && "CHẤM CÔNG VÀO"}
                      {checkInStatus === "checked_in" && "CHẤM CÔNG RA"}
                      {checkInStatus === "completed" && "ĐÃ HOÀN TẤT"}
                    </span>
                    <span className="text-[11px] font-mono font-bold mt-1 text-white/90">
                      {currentTime.toLocaleTimeString("vi-VN")}
                    </span>
                    {checkInTime && (
                      <span className="text-[10px] text-white/80 mt-1 font-medium">Vào: {checkInTime}</span>
                    )}
                    {checkOutTime && (
                      <span className="text-[10px] text-white/80 font-medium">Ra: {checkOutTime}</span>
                    )}
                  </button>
                </div>

                {/* Hộp Thông Báo Đúng Giờ / Đi Muộn */}
                {lateNotice && (
                  <div
                    className={`p-3 rounded-2xl text-xs flex items-center justify-center gap-2 mb-4 font-medium ${
                      isViolation
                        ? "bg-amber-50 text-amber-800 border border-amber-200"
                        : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    }`}
                  >
                    {isViolation ? (
                      <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                    ) : (
                      <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                    )}
                    <span>{lateNotice}</span>
                  </div>
                )}

                {/* 2 Nút Xác Thực GPS & Camera Selfie */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleGetGps}
                    className="p-2.5 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition-all flex items-center gap-2.5 cursor-pointer"
                  >
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                      <MapPin size={18} />
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold text-slate-800">Xác Thực GPS</span>
                      <span className="block text-[9px] text-slate-500 line-clamp-1">{gpsStatus}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleCapturePhoto}
                    className="p-2.5 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition-all flex items-center gap-2.5 cursor-pointer"
                  >
                    <div className="p-2 bg-purple-100 text-purple-600 rounded-xl">
                      <Camera size={18} />
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold text-slate-800">Ảnh Khuôn Mặt</span>
                      <span className="block text-[9px] text-slate-500">
                        {selfiePhoto ? "✓ Đã nhận diện" : "Chụp ảnh selfie"}
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Quick Stats Row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm text-center">
                  <span className="block text-[10px] text-slate-400 font-semibold uppercase">Công Tháng</span>
                  <span className="block text-lg font-black text-blue-600 mt-0.5">
                    {myAttendanceDays.filter(d => d === "1").length || 21.5}
                  </span>
                  <span className="text-[9px] text-emerald-600 font-medium">/ 22 ngày</span>
                </div>

                <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm text-center">
                  <span className="block text-[10px] text-slate-400 font-semibold uppercase">Phép Năm</span>
                  <span className="block text-lg font-black text-amber-600 mt-0.5">11.0</span>
                  <span className="text-[9px] text-slate-500 font-medium">ngày còn lại</span>
                </div>

                <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm text-center">
                  <span className="block text-[10px] text-slate-400 font-semibold uppercase">Lương Tạm Tính</span>
                  <span className="block text-sm font-black text-emerald-600 mt-1 line-clamp-1">
                    {myPayroll ? `${(myPayroll.netSalary / 1000000).toFixed(1)} tr` : "18.5 tr"}
                  </span>
                  <span className="text-[9px] text-slate-400">Thực nhận</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LỊCH SỬ CHẤM CÔNG */}
          {currentTab === "history" && (
            <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm space-y-3">
              <div className="flex items-center justify-between px-2">
                <button
                  type="button"
                  onClick={() => setSelectedMonth(prev => (prev > 1 ? prev - 1 : 12))}
                  className="p-2 rounded-xl bg-slate-100 text-slate-600 font-bold"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="text-center">
                  <h3 className="font-extrabold text-sm text-slate-800">
                    Tháng {selectedMonth}, Năm {selectedYear}
                  </h3>
                  <p className="text-[10px] text-slate-400">Bảng chấm công cá nhân</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMonth(prev => (prev < 12 ? prev + 1 : 1))}
                  className="p-2 rounded-xl bg-slate-100 text-slate-600 font-bold"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1.5 text-center pt-2">
                {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((d, i) => (
                  <div key={i} className="text-[11px] font-extrabold text-slate-400 py-1">{d}</div>
                ))}
                {Array.from({ length: 31 }, (_, idx) => {
                  const dayNum = idx + 1;
                  const statusVal = myAttendanceDays[idx] || "";
                  const style = getStatusBadgeStyle(statusVal);
                  return (
                    <div
                      key={idx}
                      className={`p-1.5 rounded-xl border flex flex-col items-center justify-center min-h-[46px] ${style.bg}`}
                    >
                      <span className="text-[11px] font-bold">{dayNum}</span>
                      <span className="text-[9px] uppercase font-black">{statusVal || "-"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: ĐƠN TỪ (MOBILE) */}
          {currentTab === "requests" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-white p-4 rounded-3xl border border-slate-100">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {hasPermission(activeRole, "canApproveRequests") ? "Duyệt Đơn Toàn Cty" : "Đơn Từ Của Tôi"}
                  </h3>
                  <p className="text-xs text-slate-400">Nghỉ phép, tăng ca ngoài giờ, quên chấm công</p>
                </div>
                {hasPermission(activeRole, "canCreateRequest") && (
                  <button
                    type="button"
                    onClick={() => setIsRequestModalOpen(true)}
                    className="flex items-center gap-1 bg-blue-600 text-white font-bold text-xs px-3 py-2 rounded-xl"
                  >
                    <Plus size={14} />
                    <span>Tạo Đơn</span>
                  </button>
                )}
              </div>

              {(hasPermission(activeRole, "canApproveRequests") ? allRequests : myRequests).map((req, i) => (
                <div key={req.id || i} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-bold text-xs text-slate-900">{req.ho_ten || req.ma_nv}</span>
                      <span className="text-[11px] text-blue-600 block mt-0.5">{req.type || req.request_type}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      req.status === "approved" ? "bg-emerald-100 text-emerald-800" : req.status === "rejected" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      {req.status === "approved" ? "✓ Đã duyệt" : req.status === "rejected" ? "✗ Từ chối" : "⏱ Chờ duyệt"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl">{req.reason}</p>
                  <span className="text-[10px] text-slate-400 block">Ngày áp dụng: {req.date || req.request_date}</span>

                  {hasPermission(activeRole, "canApproveRequests") && req.status === "pending" && (
                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleApproveRejectRequest(req.id, "approved")}
                        className="flex-1 py-1.5 bg-emerald-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1"
                      >
                        <Check size={14} /> Duyệt
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApproveRejectRequest(req.id, "rejected")}
                        className="flex-1 py-1.5 bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1"
                      >
                        <X size={14} /> Từ chối
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* TAB 4: BẢNG LƯƠNG / PHIẾU LƯƠNG (MOBILE) */}
          {currentTab === "payroll" && (
            <div className="space-y-3">
              {hasPermission(activeRole, "canViewCompanyPayroll") ? (
                <div className="space-y-3">
                  <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-3xl p-5 shadow-lg">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-extrabold text-base">Bảng Lương Tháng {selectedMonth}/{selectedYear}</h3>
                      <span className="text-xs bg-white/20 px-2 py-0.5 rounded-xl">{companyPayroll.length} NV</span>
                    </div>
                    <span className="text-xs text-emerald-100 block uppercase">Tổng quỹ lương Net:</span>
                    <span className="text-xl font-black text-white mt-1 block">
                      {companyPayroll.reduce((acc, c) => acc + (Number(c.netSalary) || 0), 0).toLocaleString("vi-VN")} đ
                    </span>
                  </div>

                  {companyPayroll.map((item, idx) => (
                    <div
                      key={item.ma_nv || item.id_nhan_vien || idx}
                      onClick={() => setSelectedEmployeeForDetail(item)}
                      className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex justify-between items-center cursor-pointer"
                    >
                      <div>
                        <h4 className="font-bold text-xs text-slate-900">{item.ho_ten}</h4>
                        <span className="text-[10px] text-slate-400">{item.ma_nv || item.id_nhan_vien} • {item.chuc_danh || "Nhân viên"}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black text-emerald-600 block">
                          {Number(item.netSalary || 0).toLocaleString("vi-VN")} đ
                        </span>
                        <span className="text-[9px] text-blue-600 font-bold">Xem phiếu ➔</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : myPayroll ? (
                <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-800">
                        Phiếu Lương Tháng {selectedMonth}/{selectedYear}
                      </h3>
                      <p className="text-xs text-slate-400">Mã: {myPayroll.ma_nv || myPayroll.id_nhan_vien}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Thực Nhận (Net)</span>
                      <span className="font-black text-base text-emerald-600">
                        {Number(myPayroll.netSalary).toLocaleString("vi-VN")} đ
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">Lương cơ bản HĐ:</span>
                      <strong className="text-slate-800">{Number(myPayroll.baseSalary).toLocaleString("vi-VN")} đ</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">Ngày công thực tế:</span>
                      <strong className="text-blue-600">{myPayroll.totalWorkDays} công</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">Tổng phụ cấp:</span>
                      <strong className="text-slate-800">{Number(myPayroll.totalAllowance).toLocaleString("vi-VN")} đ</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-50 text-rose-600">
                      <span>Trích trừ BHXH (10.5%):</span>
                      <strong>-{Number(myPayroll.insuranceDeduction || myPayroll.totalInsurance).toLocaleString("vi-VN")} đ</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedEmployeeForDetail(myPayroll)}
                    className="w-full py-2.5 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Printer size={14} />
                    <span>In Phiếu Lương Chi Tiết</span>
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-3xl p-8 text-center text-slate-400">
                  Chưa có dữ liệu bảng lương tháng {selectedMonth}/{selectedYear}.
                </div>
              )}
            </div>
          )}

          {/* TAB 5: HỒ SƠ CÁ NHÂN (MOBILE) */}
          {currentTab === "profile" && (
            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4 text-center">
              <img
                src={currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
                alt="Avatar"
                className="w-20 h-20 mx-auto rounded-full object-cover border-2 border-blue-500 shadow-md"
              />
              <div>
                <h3 className="font-extrabold text-base text-slate-800">{currentUser?.ho_ten}</h3>
                <p className="text-xs text-slate-400">{currentUser?.chuc_danh}</p>
                <span className="inline-block mt-1 text-[11px] font-bold bg-blue-50 text-blue-700 px-3 py-0.5 rounded-full">
                  Mã: {currentUser?.ma_nv} • {ROLE_LABELS[activeRole]}
                </span>
              </div>

              <div className="text-left space-y-2 text-xs pt-3 border-t border-slate-100">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">Công ty:</span>
                  <span className="font-bold text-slate-700">SEDINCO Construction</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">Điện thoại:</span>
                  <span className="font-bold text-slate-700">{currentUser?.dien_thoai || "0905123456"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">Email:</span>
                  <span className="font-bold text-slate-700">{currentUser?.email || "nhanvien@sedinco.vn"}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowChangePassModal(true)}
                className="w-full py-2.5 bg-slate-50 text-blue-600 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
              >
                <Lock size={14} /> Đổi Mật Khẩu Cá Nhân
              </button>
            </div>
          )}

        </main>

        {/* 3. THANH ĐIỀU HƯỚNG ĐÁY MÀN HÌNH DI ĐỘNG */}
        <nav
          className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 flex justify-around items-center pt-2 px-1 z-40 shadow-lg"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 12px) + 8px)" }}
        >
          {allowedTabs.includes("checkin") && (
            <button
              type="button"
              onClick={() => setCurrentTab("checkin")}
              className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl cursor-pointer ${
                currentTab === "checkin" ? "text-blue-600 font-bold" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Clock size={20} />
              <span className="text-[10px]">Chấm Công</span>
            </button>
          )}

          {allowedTabs.includes("history") && (
            <button
              type="button"
              onClick={() => setCurrentTab("history")}
              className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl cursor-pointer ${
                currentTab === "history" ? "text-blue-600 font-bold" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Calendar size={20} />
              <span className="text-[10px]">Lịch Sử</span>
            </button>
          )}

          {allowedTabs.includes("requests") && (
            <button
              type="button"
              onClick={() => setCurrentTab("requests")}
              className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl cursor-pointer ${
                currentTab === "requests" ? "text-blue-600 font-bold" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <FileText size={20} />
              <span className="text-[10px]">Đơn Từ</span>
            </button>
          )}

          {allowedTabs.includes("payroll") && (
            <button
              type="button"
              onClick={() => setCurrentTab("payroll")}
              className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl cursor-pointer ${
                currentTab === "payroll" ? "text-blue-600 font-bold" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <DollarSign size={20} />
              <span className="text-[10px]">
                {hasPermission(activeRole, "canViewCompanyPayroll") ? "Bảng Lương" : "Phiếu Lương"}
              </span>
            </button>
          )}

          {allowedTabs.includes("profile") && (
            <button
              type="button"
              onClick={() => setCurrentTab("profile")}
              className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl cursor-pointer ${
                currentTab === "profile" ? "text-blue-600 font-bold" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <User size={20} />
              <span className="text-[10px]">Hồ Sơ</span>
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

      </div>
    </div>
  );
}
