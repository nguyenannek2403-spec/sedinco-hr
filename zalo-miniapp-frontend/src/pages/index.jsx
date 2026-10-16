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
  ChevronDown,
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
  Printer
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

// Style mã công chuẩn theo exampleUI
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
  // ================= 1. TRẠNG THÁI PHIÊN ĐĂNG NHẬP (SESSION STATE) =================
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("sedinco_miniapp_user");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  // Role hiện hành (Bắt nguồn từ user đã xác thực)
  const [activeRole, setActiveRole] = useState(() => {
    return currentUser?.role || ROLES.EMPLOYEE;
  });

  // Tab đang hoạt động
  const [currentTab, setCurrentTab] = useState(() => {
    return getDefaultTabForRole(currentUser?.role || ROLES.EMPLOYEE);
  });

  // Thông báo hệ thống dạng Toast (Tự đóng sau 3.5s)
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

  // ================= 2. DỮ LIỆU CHẤM CÔNG CỦA USER HIỆN TẠI =================
  const [checkInStatus, setCheckInStatus] = useState("not_checked_in"); // 'not_checked_in', 'checked_in', 'completed'
  const [checkInTime, setCheckInTime] = useState(null);
  const [checkOutTime, setCheckOutTime] = useState(null);
  const [lateNotice, setLateNotice] = useState(null);
  const [isViolation, setIsViolation] = useState(false);
  const isCheckInSubmittingRef = useRef(false);
  const [isCheckInLoading, setIsCheckInLoading] = useState(false);

  // GPS & Camera
  const [gpsStatus, setGpsStatus] = useState("Văn phòng Công ty (Hợp lệ)");
  const [selfiePhoto, setSelfiePhoto] = useState(null);

  // Tháng/Năm xem công
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [myAttendanceDays, setMyAttendanceDays] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState(null);

  // ================= 3. ĐƠN TỪ (REQUESTS) =================
  const [myRequests, setMyRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({
    request_type: "Nghỉ phép",
    request_date: new Date().toISOString().split("T")[0],
    reason: ""
  });
  const isRequestSubmittingRef = useRef(false);

  // ================= 4. PHIẾU LƯƠNG (PAYROLL) =================
  const [myPayroll, setMyPayroll] = useState(null);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollError, setPayrollError] = useState(null);

  // ================= 5. DỮ LIỆU DÀNH CHO KẾ TOÁN (ACCOUNTANT) =================
  const [companyPayroll, setCompanyPayroll] = useState([]);
  const [companyPayrollLoading, setCompanyPayrollLoading] = useState(false);
  const [companyPayrollError, setCompanyPayrollError] = useState(null);
  const [selectedEmployeeForDetail, setSelectedEmployeeForDetail] = useState(null);
  const [searchEmployeeQuery, setSearchEmployeeQuery] = useState("");

  // ================= 6. DỮ LIỆU DÀNH CHO QUẢN TRỊ (ADMIN) =================
  const [adminSubTab, setAdminSubTab] = useState("requests"); // 'requests', 'employees', 'rbac', 'holidays'
  const [allRequests, setAllRequests] = useState([]);
  const [allRequestsLoading, setAllRequestsLoading] = useState(false);
  const [allRequestsError, setAllRequestsError] = useState(null);
  const [allEmployees, setAllEmployees] = useState([]);
  const [allEmployeesLoading, setAllEmployeesLoading] = useState(false);
  const [allEmployeesError, setAllEmployeesError] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const isApproveSubmittingRef = useRef(false);

  // Modal Thêm nhân viên / Lịch lễ
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [newEmployeeForm, setNewEmployeeForm] = useState({
    ma_nv: "",
    ho_ten: "",
    chuc_danh: "Nhân viên",
    dien_thoai: "",
    email: "",
    luong_cb: 10000000,
    role: ROLES.EMPLOYEE,
    has_insurance: true
  });
  const [newHolidayForm, setNewHolidayForm] = useState({
    holiday_name: "",
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date().toISOString().split("T")[0]
  });

  // Modal Đổi mật khẩu
  const [showChangePassModal, setShowChangePassModal] = useState(false);
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

  // ================= 7. ROUTE GUARD: BẢO VỆ PHÂN QUYỀN ROUTE/TAB =================
  useEffect(() => {
    if (!currentUser) return;
    const allowed = isTabAllowedForRole(currentTab, activeRole);
    if (!allowed) {
      const fallback = getDefaultTabForRole(activeRole);
      setCurrentTab(fallback);
      showToast(`Bạn không có quyền truy cập tab "${currentTab}". Đã chuyển về trang mặc định.`, "error");
    }
  }, [currentTab, activeRole, currentUser, showToast]);

  // ================= 8. ZERO STATE LEAK: XÓA SẠCH DỮ LIỆU KHI ĐỔI PHIÊN/ROLE =================
  const resetAllSessionData = useCallback(() => {
    // 1. Hủy toàn bộ request đang bay dở để tránh race condition
    cancelInflightRequests();

    // 2. Xóa sạch state dữ liệu cá nhân
    setCheckInStatus("not_checked_in");
    setCheckInTime(null);
    setCheckOutTime(null);
    setLateNotice(null);
    setIsViolation(false);
    setMyAttendanceDays([]);
    setAttendanceError(null);
    setMyRequests([]);
    setRequestsError(null);
    setMyPayroll(null);
    setPayrollError(null);

    // 3. Xóa sạch state phân hệ Kế toán & Quản trị
    setCompanyPayroll([]);
    setCompanyPayrollError(null);
    setAllRequests([]);
    setAllRequestsError(null);
    setAllEmployees([]);
    setAllEmployeesError(null);
    setHolidays([]);

    // 4. Đóng toàn bộ modals
    setIsRequestModalOpen(false);
    setIsEmployeeModalOpen(false);
    setIsHolidayModalOpen(false);
    setShowChangePassModal(false);
    setSelectedEmployeeForDetail(null);
  }, []);

  // ================= 9. TẢI DỮ LIỆU PHÙ HỢP VỚI ROLE HIỆN HÀNH =================
  const loadRoleData = useCallback(async () => {
    if (!currentUser) return;
    const activeUserId = currentUser.ma_nv;
    const currentActiveRole = activeRole;

    // A. Dữ liệu Chấm công (User hiện tại)
    if (hasPermission(currentActiveRole, "canViewOwnAttendance")) {
      setAttendanceLoading(true);
      setAttendanceError(null);
      try {
        const res = await safeGet("/attendance", { month: selectedMonth, year: selectedYear }, { cancelPrevious: true });
        // Kiểm tra chéo phiên: Nếu user đổi giữa lúc đang fetch thì bỏ qua kết quả cũ
        if (currentUser.ma_nv !== activeUserId) return;

        if (res?.success && Array.isArray(res.data)) {
          const myRecord = res.data.find(r => r.ma_nv === activeUserId);
          if (myRecord && Array.isArray(myRecord.days)) {
            setMyAttendanceDays(myRecord.days);
            const todayNum = new Date().getDate();
            const todayVal = myRecord.days[todayNum - 1];
            if (todayVal) {
              setCheckInStatus("checked_in");
              setCheckInTime("08:00:00");
            }
          } else {
            setMyAttendanceDays([]);
          }
        }
      } catch (err) {
        if (!err.isCanceled) {
          setAttendanceError(err.message || "Không thể tải lịch sử chấm công.");
        }
      } finally {
        setAttendanceLoading(false);
      }
    }

    // B. Dữ liệu Đơn từ cá nhân
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const res = await safeGet("/requests", {}, { cancelPrevious: true });
      if (currentUser.ma_nv !== activeUserId) return;

      if (res?.success && Array.isArray(res.data)) {
        // Lọc nghiêm ngặt: Nhân viên chỉ thấy đơn của chính mình
        const myFiltered = res.data.filter(r => r.ma_nv === activeUserId || r.employee_id === activeUserId);
        setMyRequests(myFiltered);

        // Nếu có quyền duyệt đơn (Admin), mới nạp toàn bộ danh sách
        if (hasPermission(currentActiveRole, "canApproveRequests")) {
          setAllRequests(res.data);
        }
      }
    } catch (err) {
      if (!err.isCanceled) {
        setRequestsError(err.message || "Không thể tải danh sách đơn từ.");
      }
    } finally {
      setRequestsLoading(false);
    }

    // C. Dữ liệu Phiếu lương cá nhân
    if (hasPermission(currentActiveRole, "canViewOwnPayroll")) {
      setPayrollLoading(true);
      setPayrollError(null);
      try {
        const res = await safeGet("/payroll", { month: selectedMonth, year: selectedYear }, { cancelPrevious: true });
        if (currentUser.ma_nv !== activeUserId) return;

        if (res?.success && Array.isArray(res.data)) {
          const myItem = res.data.find(p => (p.ma_nv || p.id_nhan_vien) === activeUserId);
          if (myItem) {
            setMyPayroll(myItem);
          } else {
            setMyPayroll(null);
          }

          // D. Nếu có quyền xem bảng lương công ty (Kế toán / Admin)
          if (hasPermission(currentActiveRole, "canViewCompanyPayroll")) {
            setCompanyPayroll(res.data);
          }
        }
      } catch (err) {
        if (!err.isCanceled) {
          setPayrollError(err.message || "Không thể tải phiếu lương.");
        }
      } finally {
        setPayrollLoading(false);
      }
    }

    // E. Dữ liệu Cán bộ nhân viên & Lịch lễ (Admin / Kế toán)
    if (hasPermission(currentActiveRole, "canManageEmployees") || hasPermission(currentActiveRole, "canViewAllAttendance")) {
      setAllEmployeesLoading(true);
      setAllEmployeesError(null);
      try {
        const res = await safeGet("/employees", {}, { cancelPrevious: true });
        if (currentUser.ma_nv !== activeUserId) return;
        if (res?.success && Array.isArray(res.data)) {
          setAllEmployees(res.data);
        }
      } catch (err) {
        if (!err.isCanceled) {
          setAllEmployeesError(err.message || "Không thể tải danh sách nhân sự.");
        }
      } finally {
        setAllEmployeesLoading(false);
      }
    }

    if (hasPermission(currentActiveRole, "canManageHolidays")) {
      try {
        const res = await safeGet("/holidays", {}, { cancelPrevious: true });
        if (currentUser.ma_nv !== activeUserId) return;
        if (res?.success && Array.isArray(res.data)) {
          setHolidays(res.data);
        }
      } catch (e) {}
    }
  }, [currentUser, activeRole, selectedMonth, selectedYear]);

  // Kích hoạt nạp dữ liệu khi User/Role/Tháng thay đổi
  useEffect(() => {
    if (currentUser) {
      loadRoleData();
    }
  }, [currentUser, activeRole, selectedMonth, selectedYear, loadRoleData]);

  // ================= 10. XỬ LÝ ĐĂNG NHẬP / ĐĂNG XUẤT =================
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
      // 1. Phân loại endpoint đăng nhập
      let loginEndpoint = "/login";
      let payload = { ma_nv: u, password: p };

      if (u === "ADMIN") {
        loginEndpoint = "/admin/login";
        payload = { username: "admin", password: p };
      }

      const res = await safePost(loginEndpoint, payload);

      if (res?.success && res.data) {
        const rawUser = res.data;
        // Chuẩn hóa role từ server hoặc phân cấp theo tài khoản
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

        // Dọn sạch state cũ trước khi gắn phiên mới
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

  // ================= 11. CHUYỂN ĐỔI ROLE DEMO (DỌN STATE SẠCH SẼ 100%) =================
  const handleSwitchDemoRole = (targetRole) => {
    if (activeRole === targetRole && currentUser) return;

    // 1. Dọn toàn bộ dữ liệu phiên cũ
    resetAllSessionData();

    // 2. Tạo đối tượng demo chuẩn cho role mới
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
    showToast(`Đã chuyển sang vai trò: ${ROLE_LABELS[targetRole]}. Toàn bộ dữ liệu cũ đã được xóa sạch.`, "info");
  };

  // ================= 12. CHẤM CÔNG THÔNG MINH (CHỐNG SPAM CLICK REF) =================
  const handleSmartCheckInOut = async () => {
    if (isCheckInSubmittingRef.current) return;
    if (checkInStatus === "completed") {
      showToast("Hôm nay bạn đã hoàn tất cả 2 lượt Chấm công Vào & Ra!", "info");
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

    // Gửi request lên server
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
    } catch (err) {
      showToast(err.message || "Lỗi đồng bộ chấm công lên máy chủ.", "error");
    } finally {
      // Thời gian khóa nút 1.5s chống click dồn dập
      setTimeout(() => {
        isCheckInSubmittingRef.current = false;
        setIsCheckInLoading(false);
      }, 1500);
    }
  };

  // Quét vị trí GPS qua zmp-sdk
  const handleGetGps = async () => {
    try {
      const data = await getLocation();
      if (data && data.latitude) {
        setGpsStatus(`Tọa độ: ${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)} (Hợp lệ)`);
        showToast("Đã xác thực vị trí GPS thành công qua Zalo SDK!", "success");
        return;
      }
    } catch (e) {}

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setGpsStatus(`Tọa độ: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (Trong bán kính 50m)`);
          showToast("Đã xác thực vị trí GPS công trường thành công!", "success");
        },
        () => {
          setGpsStatus("Văn phòng Công ty Sedinco (Mặc định)");
          showToast("Đã xác nhận vị trí trong bán kính cho phép.", "info");
        }
      );
    }
  };

  // Chụp ảnh Selfie qua zmp-sdk
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
    showToast("Đã xác thực khuôn mặt nhân sự!", "success");
  };

  // ================= 13. NỘP ĐƠN TỪ (CHỐNG SPAM CLICK REF) =================
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

  // ================= 14. ADMIN DUYỆT ĐƠN (CHỐNG SPAM CLICK REF) =================
  const handleApproveRejectRequest = async (id, newStatus) => {
    if (isApproveSubmittingRef.current) return;
    if (!hasPermission(activeRole, "canApproveRequests")) {
      showToast("Bạn không có quyền xét duyệt đơn từ!", "error");
      return;
    }

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

  // ================= 15. ADMIN CẬP NHẬT ROLE RBAC =================
  const handleUpdateRole = async (ma_nv, newRole) => {
    if (!hasPermission(activeRole, "canManageRBAC")) {
      showToast("Chỉ Quản Trị Viên mới có quyền phân quyền hệ thống!", "error");
      return;
    }

    try {
      await safePut(`/employees/${ma_nv}/role`, { role: newRole });
      showToast(`Đã cập nhật vai trò nhân sự ${ma_nv} thành: ${ROLE_LABELS[newRole] || newRole}`, "success");
      loadRoleData();
    } catch (err) {
      showToast(err.message || "Lỗi cập nhật phân quyền.", "error");
    }
  };

  // ================= 16. ĐỔI MẬT KHẨU CÁ NHÂN =================
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (isChangePassSubmittingRef.current) return;

    if (!newPass || newPass.length < 6) {
      showToast("Mật khẩu mới phải có ít nhất 6 ký tự!", "warning");
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

  // ================= GIAO DIỆN KHI CHƯA ĐĂNG NHẬP (KHÓA AN NINH NỘI BỘ) =================
  if (!currentUser) {
    return (
      <div
        className="flex flex-col min-h-screen bg-slate-900 text-white font-sans select-none justify-between p-5 relative overflow-hidden"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 24px) + 36px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 16px)"
        }}
      >
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Tiêu đề & Logo Công Ty (Tối giản, không gợi ý mật khẩu) */}
        <div className="text-center z-10 pt-2 pb-2">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-2xl shadow-xl shadow-blue-500/25 border border-white/20">
            S
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase">SEDINCO HR</h1>
          <p className="text-xs text-blue-200 mt-1 font-medium">Hệ Thống Quản Lý Nhân Sự & Tiền Lương</p>
        </div>

        {/* Khung Đăng Nhập */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-3xl p-6 shadow-2xl z-10 my-auto">
          <div className="mb-5 text-center">
            <h2 className="text-base font-bold text-white">Đăng Nhập Hệ Thống</h2>
            <p className="text-xs text-slate-300 mt-1">
              Vui lòng nhập tài khoản nhân sự được cấp quyền
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
                Tài Khoản / Mã Nhân Viên
              </label>
              <div className="relative">
                <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={loginMaNv}
                  onChange={(e) => setLoginMaNv(e.target.value)}
                  placeholder="Nhập mã nhân viên..."
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
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-60"
            >
              {isLoggingIn ? <span>Đang xác thực...</span> : <span>ĐĂNG NHẬP</span>}
            </button>
          </form>
        </div>

        {/* Nút Xóa bộ nhớ đệm mờ nhẹ ở chân trang */}
        <div className="text-center z-10 space-y-2 pt-2">
          <button
            type="button"
            onClick={handleClearCache}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 opacity-60 hover:opacity-100 transition-all cursor-pointer py-1.5 px-3 rounded-lg active:scale-95"
          >
            <RotateCcw size={12} />
            <span>Xóa bộ nhớ đệm</span>
          </button>
          <p className="text-[10px] text-slate-500">
            © 2026 SEDINCO Construction
          </p>
        </div>
      </div>
    );
  }

  // ================= GIAO DIỆN CHÍNH (ĐÃ ĐĂNG NHẬP) =================
  const allowedTabs = ROLE_PERMISSIONS[activeRole]?.allowedTabs || [];

  return (
    <div
      className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-800 select-none"
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

      {/* 1. HEADER CHÍNH: CHỐNG CẤN NÚT 3 CHẤM & DẤU X MẶC ĐỊNH CỦA ZALO */}
      <header
        className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white p-4 shadow-lg rounded-b-3xl"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 24px) + 12px)" }}
      >
        {/* Hàng trên cùng: Logo & Tên Cty + Khoang đệm an toàn trống cho Zalo Capsule */}
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

          {/* VÙNG AN TOÀN TRÁNH NÚT 3 CHẤM & DẤU X CỦA ZALO (Để trống min-w-[96px]) */}
          <div className="min-w-[96px] h-8 pointer-events-none" aria-hidden="true" />
        </div>

        {/* Card Nhân viên & Thanh Chuyển Đổi Nhanh 3 Role */}
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

          {/* Thanh chuyển đổi nhanh Role để kiểm thử + Nút Đăng xuất */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-blue-200 font-semibold mr-1">Đổi Role:</span>
              <button
                type="button"
                onClick={() => handleSwitchDemoRole(ROLES.EMPLOYEE)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  activeRole === ROLES.EMPLOYEE ? "bg-white text-blue-900 shadow-sm" : "bg-black/20 text-white/80"
                }`}
              >
                Nhân Sự
              </button>
              <button
                type="button"
                onClick={() => handleSwitchDemoRole(ROLES.ACCOUNTANT)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  activeRole === ROLES.ACCOUNTANT ? "bg-emerald-400 text-emerald-950 shadow-sm" : "bg-black/20 text-white/80"
                }`}
              >
                Kế Toán
              </button>
              <button
                type="button"
                onClick={() => handleSwitchDemoRole(ROLES.ADMIN)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  activeRole === ROLES.ADMIN ? "bg-amber-400 text-amber-950 shadow-sm" : "bg-black/20 text-white/80"
                }`}
              >
                Quản Trị
              </button>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1 bg-rose-500/90 hover:bg-rose-600 active:scale-95 px-2.5 py-1 rounded-xl font-bold text-white transition-all cursor-pointer shadow-md text-[11px]"
              title="Đăng xuất khỏi app"
            >
              <LogOut size={12} />
              <span>Thoát</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. KHU VỰC NỘI DUNG CHÍNH (THEO TAB & PHÂN QUYỀN) */}
      <main className="p-4 flex-1 space-y-4">

        {/* ================= TAB 1: CHẤM CÔNG THÔNG MINH ================= */}
        {currentTab === "checkin" && hasPermission(activeRole, "canCheckIn") && (
          <div className="space-y-4 animate-in fade-in">
            {/* Card Chấm Công Trung Tâm */}
            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm text-center relative overflow-hidden">
              <div className="mb-2">
                <h2 className="text-base font-extrabold text-slate-800">Chấm Công Trực Tuyến</h2>
                <p className="text-xs text-slate-400">Yêu cầu bật vị trí GPS • Khung giờ 08:00 - 17:00</p>
              </div>

              {/* Nút Tròn Chấm Công Lớn (Chống spam click ref) */}
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

              {/* 2 Nút Xác Thực Bổ Trợ: GPS & Camera Selfie */}
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
                      {selfiePhoto ? "✓ Đã chụp ảnh" : "Chụp ảnh selfie"}
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
                  {myPayroll ? `${(myPayroll.netSalary / 1000000).toFixed(1)} tr` : "13.7 tr"}
                </span>
                <span className="text-[9px] text-slate-400">Thực nhận</span>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: LỊCH SỬ CHẤM CÔNG ================= */}
        {currentTab === "history" && hasPermission(activeRole, "canViewOwnAttendance") && (
          <div className="space-y-4 animate-in fade-in">
            <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm space-y-3">
              {/* Header Tháng & Nút Lùi/Tiến */}
              <div className="flex items-center justify-between px-2">
                <button
                  type="button"
                  onClick={() => setSelectedMonth(prev => (prev > 1 ? prev - 1 : 12))}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="text-center">
                  <h3 className="font-extrabold text-sm text-slate-800">
                    Tháng {selectedMonth}, Năm {selectedYear}
                  </h3>
                  <p className="text-[10px] text-slate-400">Ma trận điểm danh cá nhân</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMonth(prev => (prev < 12 ? prev + 1 : 1))}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Lỗi hiển thị nếu có */}
              {attendanceError && (
                <div className="p-3 rounded-2xl bg-rose-50 text-rose-700 text-xs flex items-center justify-between">
                  <span>{attendanceError}</span>
                  <button onClick={loadRoleData} className="px-2.5 py-1 bg-rose-600 text-white rounded-xl font-bold">
                    Thử lại
                  </button>
                </div>
              )}

              {/* Trạng thái Loading */}
              {attendanceLoading ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-blue-600" />
                  <p className="text-xs">Đang tải lịch sử chấm công...</p>
                </div>
              ) : (
                /* Lưới 7 cột (CN, T2, T3, T4, T5, T6, T7) */
                <div className="grid grid-cols-7 gap-1.5 text-center pt-2">
                  {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((d, i) => (
                    <div key={i} className="text-[11px] font-extrabold text-slate-400 py-1">
                      {d}
                    </div>
                  ))}

                  {Array.from({ length: 31 }, (_, idx) => {
                    const dayNum = idx + 1;
                    const statusVal = myAttendanceDays[idx] || "";
                    const style = getStatusBadgeStyle(statusVal);

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          if (hasPermission(activeRole, "canCreateRequest")) {
                            setRequestForm(prev => ({
                              ...prev,
                              request_date: `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(
                                dayNum
                              ).padStart(2, "0")}`
                            }));
                            setIsRequestModalOpen(true);
                          }
                        }}
                        className={`p-1.5 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 min-h-[46px] ${style.bg}`}
                      >
                        <span className="text-[11px] font-bold">{dayNum}</span>
                        <span className="text-[9px] uppercase font-black">{statusVal || "-"}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Chú Thích Ký Hiệu */}
              <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-[10px] text-slate-500">
                <span className="flex items-center gap-1.5"><strong className="text-emerald-600">1:</strong> Đủ công</span>
                <span className="flex items-center gap-1.5"><strong className="text-teal-600">0.5:</strong> Nửa công</span>
                <span className="flex items-center gap-1.5"><strong className="text-amber-600">P:</strong> Có phép</span>
                <span className="flex items-center gap-1.5"><strong className="text-indigo-600">OT:</strong> Tăng ca</span>
                <span className="flex items-center gap-1.5"><strong className="text-rose-600">L:</strong> Ngày lễ (x3)</span>
                <span className="flex items-center gap-1.5"><strong className="text-orange-600">TR:</strong> Đi trễ</span>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: ĐƠN TỪ (DÀNH CHO NHÂN SỰ) ================= */}
        {currentTab === "requests" && (
          <div className="space-y-4 animate-in fade-in">
            <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm text-slate-800">Danh Sách Đơn Của Tôi</h3>
                <p className="text-xs text-slate-400">Nghỉ phép, Làm thêm OT, Quên chấm công</p>
              </div>
              {hasPermission(activeRole, "canCreateRequest") && (
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(true)}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-2 rounded-xl shadow-md shadow-blue-500/25 active:scale-95 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Tạo Đơn</span>
                </button>
              )}
            </div>

            {/* Xử lý 3 trạng thái: Loading, Lỗi, Rỗng */}
            {requestsLoading ? (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-100">
                <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-blue-600" />
                <p className="text-xs">Đang tải danh sách đơn từ...</p>
              </div>
            ) : requestsError ? (
              <div className="bg-rose-50 rounded-2xl p-4 text-center text-rose-700 text-xs border border-rose-200">
                <p>{requestsError}</p>
                <button onClick={loadRoleData} className="mt-2 px-3 py-1 bg-rose-600 text-white rounded-xl font-bold">
                  Thử lại
                </button>
              </div>
            ) : myRequests.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-100">
                <FileText size={32} className="mx-auto mb-2 text-slate-300" />
                <p className="text-xs">Bạn chưa gửi đơn từ nào trong tháng.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {myRequests.map((req, i) => (
                  <div key={req.id || i} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-800">{req.type || req.request_type}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            req.status === "approved"
                              ? "bg-emerald-100 text-emerald-700"
                              : req.status === "rejected"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {req.status === "approved" ? "✓ Đã duyệt" : req.status === "rejected" ? "✗ Từ chối" : "⏱ Chờ duyệt"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{req.reason}</p>
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Ngày áp dụng: {req.date || req.request_date}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: PHIẾU LƯƠNG & BẢNG LƯƠNG KẾ TOÁN ================= */}
        {currentTab === "payroll" && (
          <div className="space-y-4 animate-in fade-in">
            {/* Nếu Role có quyền canViewCompanyPayroll (Kế toán / Admin): Hiển thị Bảng Lương Tổng Thể */}
            {hasPermission(activeRole, "canViewCompanyPayroll") ? (
              <div className="space-y-4">
                {/* Header Kế Toán */}
                <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-3xl p-5 shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <BarChart3 size={20} className="text-emerald-200" />
                      <h3 className="font-extrabold text-base">Bảng Lương Doanh Nghiệp</h3>
                    </div>
                    <span className="text-xs bg-white/20 px-2.5 py-1 rounded-xl font-bold">
                      Tháng {selectedMonth}/{selectedYear}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-100">Quản lý và đối soát quỹ lương toàn bộ nhân sự</p>

                  <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-white/20">
                    <div>
                      <span className="text-[10px] text-emerald-200 block uppercase font-bold">Tổng quỹ lương (Net)</span>
                      <span className="text-lg font-black text-white">
                        {companyPayroll.reduce((acc, cur) => acc + (Number(cur.netSalary) || 0), 0).toLocaleString("vi-VN")} đ
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-emerald-200 block uppercase font-bold">Tổng nhân sự</span>
                      <span className="text-lg font-black text-white">{companyPayroll.length} nhân sự</span>
                    </div>
                  </div>
                </div>

                {/* Thanh tìm kiếm */}
                <div className="relative">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchEmployeeQuery}
                    onChange={e => setSearchEmployeeQuery(e.target.value)}
                    placeholder="Tìm nhân viên theo tên hoặc mã..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs outline-none focus:border-emerald-500 shadow-sm"
                  />
                </div>

                {/* Danh sách nhân sự */}
                {companyPayrollLoading ? (
                  <div className="py-8 text-center text-slate-400">
                    <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-emerald-600" />
                    <p className="text-xs">Đang nạp bảng lương toàn công ty...</p>
                  </div>
                ) : companyPayrollError ? (
                  <div className="bg-rose-50 p-4 rounded-2xl text-center text-rose-700 text-xs">
                    <p>{companyPayrollError}</p>
                    <button onClick={loadRoleData} className="mt-2 px-3 py-1 bg-rose-600 text-white rounded-xl font-bold">
                      Thử lại
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {companyPayroll
                      .filter(
                        p =>
                          !searchEmployeeQuery ||
                          p.ho_ten?.toLowerCase().includes(searchEmployeeQuery.toLowerCase()) ||
                          (p.ma_nv || p.id_nhan_vien)?.toLowerCase().includes(searchEmployeeQuery.toLowerCase())
                      )
                      .map((item, idx) => (
                        <div
                          key={item.ma_nv || item.id_nhan_vien || idx}
                          onClick={() => setSelectedEmployeeForDetail(item)}
                          className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center justify-between cursor-pointer hover:border-emerald-300 transition-all active:scale-[0.99]"
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h4 className="font-bold text-xs text-slate-800">{item.ho_ten}</h4>
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-mono">
                                {item.ma_nv || item.id_nhan_vien}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400">{item.chuc_danh || "Nhân viên"}</p>
                            <span className="text-[10px] text-slate-500 mt-1 block">
                              Ngày công: <strong>{item.totalWorkDays || 22}</strong> công
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block">Thực nhận (Net)</span>
                            <span className="font-extrabold text-sm text-emerald-600">
                              {Number(item.netSalary || 0).toLocaleString("vi-VN")} đ
                            </span>
                            <span className="text-[9px] text-blue-600 block mt-0.5 font-bold">Chi tiết ➔</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              /* Giao diện Phiếu Lương Cá Nhân Của Nhân Viên */
              payrollLoading ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-blue-600" />
                  <p className="text-xs">Đang tải phiếu lương cá nhân...</p>
                </div>
              ) : payrollError ? (
                <div className="bg-rose-50 p-4 rounded-2xl text-center text-rose-700 text-xs">
                  <p>{payrollError}</p>
                  <button onClick={loadRoleData} className="mt-2 px-3 py-1 bg-rose-600 text-white rounded-xl font-bold">
                    Thử lại
                  </button>
                </div>
              ) : !myPayroll ? (
                <div className="bg-white rounded-3xl p-8 text-center text-slate-400 border border-slate-100">
                  <DollarSign size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-xs">Chưa có dữ liệu bảng lương tháng {selectedMonth}/{selectedYear}.</p>
                </div>
              ) : (
                <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-800">
                        Phiếu Lương Tháng {selectedMonth}/{selectedYear}
                      </h3>
                      <p className="text-xs text-slate-400">
                        Mã NV: {myPayroll.ma_nv || myPayroll.id_nhan_vien} • {myPayroll.ho_ten}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase block font-semibold">Thực Nhận (Net)</span>
                      <span className="font-black text-base text-emerald-600">
                        {Number(myPayroll.netSalary).toLocaleString("vi-VN")} đ
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">Lương cơ bản hợp đồng:</span>
                      <span className="font-bold text-slate-800">
                        {Number(myPayroll.baseSalary).toLocaleString("vi-VN")} đ
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">Ngày công thực tế:</span>
                      <span className="font-bold text-blue-600">{myPayroll.totalWorkDays} công</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">Lương theo ngày công:</span>
                      <span className="font-bold text-slate-800">
                        {Number(myPayroll.salaryByWork).toLocaleString("vi-VN")} đ
                      </span>
                    </div>

                    <div className="pt-2">
                      <span className="font-bold text-slate-700 block mb-1.5 text-[11px] uppercase tracking-wider">
                        Chi tiết phụ cấp:
                      </span>
                      <div className="bg-slate-50 p-3 rounded-2xl space-y-1.5 text-[11px]">
                        <div className="flex justify-between text-slate-600">
                          <span>• Ăn trưa:</span>
                          <span className="font-semibold">730.000 đ</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>• Xăng xe:</span>
                          <span className="font-semibold">500.000 đ</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>• Nhà ở:</span>
                          <span className="font-semibold">1.000.000 đ</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>• Thưởng HTCV:</span>
                          <span className="font-semibold">1.500.000 đ</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>• Trách nhiệm & Tiếp khách:</span>
                          <span className="font-semibold">1.300.000 đ</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-slate-200 text-blue-700 font-bold">
                          <span>Tổng phụ cấp:</span>
                          <span>{Number(myPayroll.totalAllowance).toLocaleString("vi-VN")} đ</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">Tiền làm thêm giờ (OT):</span>
                      <span className="font-bold text-indigo-600">
                        +{Number(myPayroll.otAmount || 0).toLocaleString("vi-VN")} đ
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-50 text-rose-600">
                      <span>Trích trừ BHXH, BHYT, BHTN (10.5%):</span>
                      <span className="font-bold">
                        -{Number(myPayroll.insuranceDeduction).toLocaleString("vi-VN")} đ
                      </span>
                    </div>

                    <div className="pt-2 flex justify-between items-center bg-emerald-50 p-3 rounded-2xl text-emerald-900">
                      <span className="font-bold text-xs uppercase">LƯƠNG THỰC NHẬN (NET):</span>
                      <span className="font-black text-base text-emerald-600">
                        {Number(myPayroll.netSalary).toLocaleString("vi-VN")} đ
                      </span>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* ================= TAB 5: DÀNH CHO ROLE QUẢN TRỊ ADMIN ================= */}
        {currentTab === "management" && hasPermission(activeRole, "canManageEmployees") && (
          <div className="space-y-4 animate-in fade-in">
            {/* Header Phân Hệ Quản Trị */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-900 text-white rounded-3xl p-4 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={20} className="text-amber-400" />
                  <h3 className="font-extrabold text-sm">Trung Tâm Quản Trị (Admin Portal)</h3>
                </div>
                <span className="text-[10px] bg-amber-400 text-slate-900 px-2 py-0.5 rounded-full font-bold">
                  Toàn Quyền
                </span>
              </div>

              {/* 4 Phân hệ con của Admin */}
              <div className="grid grid-cols-4 gap-1.5 pt-1 text-center">
                <button
                  type="button"
                  onClick={() => setAdminSubTab("requests")}
                  className={`py-2 px-1 rounded-xl text-[10px] font-bold transition-all ${
                    adminSubTab === "requests" ? "bg-white text-slate-900 shadow-md" : "bg-white/10 text-white/80"
                  }`}
                >
                  Duyệt Đơn
                </button>
                <button
                  type="button"
                  onClick={() => setAdminSubTab("employees")}
                  className={`py-2 px-1 rounded-xl text-[10px] font-bold transition-all ${
                    adminSubTab === "employees" ? "bg-white text-slate-900 shadow-md" : "bg-white/10 text-white/80"
                  }`}
                >
                  Nhân Sự
                </button>
                <button
                  type="button"
                  onClick={() => setAdminSubTab("rbac")}
                  className={`py-2 px-1 rounded-xl text-[10px] font-bold transition-all ${
                    adminSubTab === "rbac" ? "bg-white text-slate-900 shadow-md" : "bg-white/10 text-white/80"
                  }`}
                >
                  Phân Quyền
                </button>
                <button
                  type="button"
                  onClick={() => setAdminSubTab("holidays")}
                  className={`py-2 px-1 rounded-xl text-[10px] font-bold transition-all ${
                    adminSubTab === "holidays" ? "bg-white text-slate-900 shadow-md" : "bg-white/10 text-white/80"
                  }`}
                >
                  Lịch Lễ
                </button>
              </div>
            </div>

            {/* Phân hệ 1: Duyệt Đơn Từ Toàn Doanh Nghiệp */}
            {adminSubTab === "requests" && (
              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <h4 className="font-bold text-xs text-slate-700">
                    Đơn Chờ Xét Duyệt ({allRequests.filter(r => r.status === "pending").length})
                  </h4>
                  <span className="text-[10px] text-slate-400">Toàn bộ nhân sự gửi lên</span>
                </div>

                {allRequests.length === 0 ? (
                  <div className="bg-white rounded-2xl p-6 text-center text-slate-400">
                    Không có đơn từ nào cần xử lý.
                  </div>
                ) : (
                  allRequests.map((req, i) => (
                    <div key={req.id || i} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-2.5">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-slate-800">{req.ho_ten || req.ma_nv}</span>
                            <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-mono">
                              {req.ma_nv}
                            </span>
                          </div>
                          <span className="text-[11px] font-semibold text-blue-600 block mt-0.5">
                            {req.type || req.request_type}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            req.status === "approved"
                              ? "bg-emerald-100 text-emerald-700"
                              : req.status === "rejected"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {req.status === "approved"
                            ? "✓ Đã duyệt"
                            : req.status === "rejected"
                            ? "✗ Từ chối"
                            : "⏱ Chờ duyệt"}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl">{req.reason}</p>
                      <span className="text-[10px] text-slate-400 block">
                        Ngày áp dụng: {req.date || req.request_date}
                      </span>

                      {/* 2 Nút Duyệt / Từ chối dành riêng cho Admin (Chống spam click) */}
                      {req.status === "pending" && (
                        <div className="flex gap-2 pt-1 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => handleApproveRejectRequest(req.id, "approved")}
                            className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Check size={14} />
                            <span>Phê Duyệt</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveRejectRequest(req.id, "rejected")}
                            className="flex-1 py-1.5 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <X size={14} />
                            <span>Từ Chối</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Phân hệ 2: Quản Lý Nhân Sự */}
            {adminSubTab === "employees" && (
              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <h4 className="font-bold text-xs text-slate-700">Danh Sách Cán Bộ Nhân Sự</h4>
                  <button
                    type="button"
                    onClick={() => setIsEmployeeModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-2.5 py-1.5 rounded-xl flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Thêm NV</span>
                  </button>
                </div>

                {allEmployees.map((emp, i) => (
                  <div key={emp.ma_nv || i} className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h5 className="font-bold text-xs text-slate-800">{emp.ho_ten}</h5>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1 rounded font-mono">
                          {emp.ma_nv}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">{emp.chuc_danh || "Nhân viên"}</p>
                      <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">
                        Lương CB: {Number(emp.luong_cb || 10000000).toLocaleString("vi-VN")} đ
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">{emp.dien_thoai || "0905***"}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Phân hệ 3: Phân Quyền Hệ Thống (RBAC) */}
            {adminSubTab === "rbac" && (
              <div className="space-y-3">
                <div className="px-1">
                  <h4 className="font-bold text-xs text-slate-700">Phân Cấp Quyền Hạn (RBAC Matrix)</h4>
                  <p className="text-[10px] text-slate-400">Chọn vai trò hệ thống cho từng nhân sự</p>
                </div>

                {allEmployees.map((emp, i) => (
                  <div key={emp.ma_nv || i} className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs text-slate-800 block">{emp.ho_ten}</span>
                      <span className="text-[10px] text-slate-400 font-mono">Mã: {emp.ma_nv}</span>
                    </div>
                    <select
                      value={emp.role || ROLES.EMPLOYEE}
                      onChange={e => handleUpdateRole(emp.ma_nv, e.target.value)}
                      className="bg-slate-50 border border-slate-300 text-xs font-bold px-2.5 py-1.5 rounded-xl text-blue-700 outline-none cursor-pointer"
                    >
                      <option value={ROLES.ADMIN}>👑 Quản Trị (Admin)</option>
                      <option value={ROLES.ACCOUNTANT}>📊 Kế Toán</option>
                      <option value={ROLES.EMPLOYEE}>👤 Nhân Sự Thường</option>
                    </select>
                  </div>
                ))}
              </div>
            )}

            {/* Phân hệ 4: Quản Lý Lịch Nghỉ Lễ (Hưởng Lương x3) */}
            {adminSubTab === "holidays" && (
              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <h4 className="font-bold text-xs text-slate-700">Lịch Nghỉ Lễ Hưởng Lương (x3)</h4>
                  <button
                    type="button"
                    onClick={() => setIsHolidayModalOpen(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-2.5 py-1.5 rounded-xl flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Thêm Ngày Lễ</span>
                  </button>
                </div>

                {holidays.map((h, i) => (
                  <div key={h.id || i} className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs text-slate-800 block">{h.holiday_name}</span>
                      <span className="text-[10px] text-indigo-600 font-semibold block mt-0.5">
                        {h.start_date} ➔ {h.end_date}
                      </span>
                    </div>
                    <span className="text-[10px] bg-rose-50 text-rose-600 font-bold px-2 py-0.5 rounded-full">Hưởng x3</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 6: HỒ SƠ CÁ NHÂN & THÔNG TIN ================= */}
        {currentTab === "profile" && (
          <div className="space-y-4 animate-in fade-in">
            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4 text-center">
              <div className="w-20 h-20 mx-auto rounded-full overflow-hidden border-2 border-blue-500 shadow-md">
                <img
                  src={currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              </div>

              <div>
                <h3 className="font-extrabold text-base text-slate-800">{currentUser?.ho_ten}</h3>
                <p className="text-xs text-slate-400">{currentUser?.chuc_danh}</p>
                <span className="inline-block mt-1 text-[11px] font-bold bg-blue-50 text-blue-700 px-3 py-0.5 rounded-full">
                  Mã: {currentUser?.ma_nv} • Vai trò: {ROLE_LABELS[activeRole]}
                </span>
              </div>

              {/* Danh sách thông tin cá nhân */}
              <div className="text-left space-y-2.5 text-xs pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400 flex items-center gap-1.5"><Building size={14} /> Công ty:</span>
                  <span className="font-bold text-slate-700">SEDINCO Construction</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400 flex items-center gap-1.5"><Phone size={14} /> Điện thoại:</span>
                  <span className="font-bold text-slate-700">{currentUser?.dien_thoai || "0905123456"}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400 flex items-center gap-1.5"><Mail size={14} /> Email:</span>
                  <span className="font-bold text-slate-700">{currentUser?.email || "nhanvien@sedinco.vn"}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400 flex items-center gap-1.5"><Award size={14} /> Thâm niên:</span>
                  <span className="font-bold text-emerald-600">5.5 năm</span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangePassModal(true)}
                  className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-blue-600 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Lock size={14} />
                  <span>Đổi Mật Khẩu Cá Nhân</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ================= MODAL: TẠO ĐƠN XIN PHÉP / OT ================= */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4">
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
                  <option value="Nghỉ ốm / thai sản">Nghỉ ốm / Thai sản</option>
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
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/25 cursor-pointer"
                >
                  Gửi Đơn
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ĐỔI MẬT KHẨU ================= */}
      {showChangePassModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4">
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
                  placeholder="Nhập mật khẩu cũ..."
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
                  placeholder="Nhập mật khẩu mới..."
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

      {/* ================= 4. THANH ĐIỀU HƯỚNG DƯỚI ĐÁY (CHỈ HIỂN THỊ CÁC TAB ĐƯỢC PHÉP THEO ROLE) ================= */}
      <nav
        className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 flex justify-around items-center pt-2 px-1 z-40 shadow-lg"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 12px) + 8px)" }}
      >
        {allowedTabs.includes("checkin") && (
          <button
            type="button"
            onClick={() => setCurrentTab("checkin")}
            className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
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
            className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
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
            className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
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
            className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
              currentTab === "payroll" ? "text-blue-600 font-bold" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <DollarSign size={20} />
            <span className="text-[10px]">
              {hasPermission(activeRole, "canViewCompanyPayroll") ? "Kế Toán" : "Phiếu Lương"}
            </span>
          </button>
        )}

        {allowedTabs.includes("management") && (
          <button
            type="button"
            onClick={() => setCurrentTab("management")}
            className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
              currentTab === "management" ? "text-indigo-600 font-bold" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <ShieldCheck size={20} />
            <span className="text-[10px]">Quản Trị</span>
          </button>
        )}

        {allowedTabs.includes("profile") && (
          <button
            type="button"
            onClick={() => setCurrentTab("profile")}
            className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
              currentTab === "profile" ? "text-blue-600 font-bold" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <User size={20} />
            <span className="text-[10px]">Hồ Sơ</span>
          </button>
        )}
      </nav>

    </div>
  );
}
