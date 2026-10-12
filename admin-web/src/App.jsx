import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  LayoutDashboard, Users, Calculator, Printer, Search, Plus, Edit, Trash2, X, 
  TrendingUp, AlertCircle, CheckCircle2, CalendarCheck, ClipboardCheck, Menu, CheckSquare, Send, Check, XCircle, Clock, CalendarDays, Building2, Save, Upload,
  LogOut, Lock, Shield, User, KeyRound, UserCheck, ArrowRight, ShieldCheck, FileText
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? 'https://sedinco-backend.onrender.com/api'
    : 'http://localhost:5001/api');

function App() {
  // State xác thực & phân quyền
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('sedinco_auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [loginRoleTab, setLoginRoleTab] = useState('admin');
  const [loginUsername, setLoginUsername] = useState('admin');
  const [loginMaNv, setLoginMaNv] = useState('NV001');
  const [loginPassword, setLoginPassword] = useState('123456');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Đơn từ cho nhân viên tự nộp
  const [isEmpLeaveModalOpen, setIsEmpLeaveModalOpen] = useState(false);
  const [empLeaveForm, setEmpLeaveForm] = useState({ request_type: 'Nghỉ phép', request_date: '', reason: '' });

  const [activeTab, setActiveTab] = useState('attendance_board'); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [payroll, setPayroll] = useState([]);
  const [loadingPayroll, setLoadingPayroll] = useState(false);

  const [employees, setEmployees] = useState([]);
  const [loadingEmp, setLoadingEmp] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ 
    ma_nv: '', ho_ten: '', ngay_sinh: '', dien_thoai: '', email: '', chuc_danh: '', ngay_bat_dau_lam: '', 
    luong_cb: '', phu_cap_an_trua: '', phu_cap_xang_xe: '', phu_cap_nha_o: '', thuong_htcv: '', 
    phu_cap_trach_nhiem: '', phu_cap_tiep_khach: '', ngay_chinh_thuc: '', has_insurance: true 
  });

  const [selectedMonth, setSelectedMonth] = useState('10');
  const [selectedYear, setSelectedYear] = useState('2026');
  
  const [payrollMonth, setPayrollMonth] = useState('10');
  const [payrollYear, setPayrollYear] = useState('2026');

  const [attendanceData, setAttendanceData] = useState([]);
  const [cellEditModal, setCellEditModal] = useState({ isOpen: false, empIndex: null, dayIndex: null, currentValue: '', empName: '', dateStr: '' });
  
  const [holidays, setHolidays] = useState([]);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [holidayForm, setHolidayForm] = useState({ holiday_name: '', start_date: '', end_date: '' });
  const [companyConfig, setCompanyConfig] = useState({ company_name: '', phone: '', address: '', tax_code: '', logo_url: '' });

  const [otHoursInputModal, setOtHoursInputModal] = useState({ isOpen: false, statusType: '', hours: 3 });
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState([]); 
  const [zaloModal, setZaloModal] = useState({ isOpen: false, status: '', logs: [] });
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const fetchAttendance = () => {
    axios.get(`${API_BASE}/attendance?month=${selectedMonth}&year=${selectedYear}`)
      .then(res => setAttendanceData(res.data?.data || []))
      .catch(() => setAttendanceData([]));
  };

  const fetchEmployees = () => {
    setLoadingEmp(true);
    axios.get(`${API_BASE}/employees`)
      .then(res => { setEmployees(res.data?.data || []); setLoadingEmp(false); })
      .catch(() => { setEmployees([]); setLoadingEmp(false); });
  };

  const fetchRequests = () => {
    setLoadingRequests(true);
    axios.get(`${API_BASE}/requests`)
      .then(res => { setLeaveRequests(res.data?.data || []); setLoadingRequests(false); })
      .catch(() => { setLeaveRequests([]); setLoadingRequests(false); });
  };

  const fetchHolidays = () => {
    axios.get(`${API_BASE}/holidays`)
      .then(res => setHolidays(res.data?.data || []))
      .catch(() => setHolidays([]));
  };

  const fetchCompanyConfig = () => {
    axios.get(`${API_BASE}/company`)
      .then(res => { if(res.data?.data) setCompanyConfig(res.data.data); })
      .catch(() => {});
  };

  const handleLogin = (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');

    if (loginRoleTab === 'admin') {
      axios.post(`${API_BASE}/admin/login`, {
        username: loginUsername.trim(),
        password: loginPassword
      })
      .then(res => {
        setLoginLoading(false);
        if (res.data?.success) {
          const user = {
            ...res.data.data,
            roleType: 'admin',
            roleName: res.data.data.ho_ten || 'Giám Đốc Quản Trị',
            displayTitle: 'Ban Giám Đốc / Admin'
          };
          setCurrentUser(user);
          localStorage.setItem('sedinco_auth_user', JSON.stringify(user));
          setActiveTab('dashboard');
        } else {
          setLoginError(res.data?.message || 'Tài khoản hoặc mật khẩu không chính xác!');
        }
      })
      .catch(err => {
        setLoginLoading(false);
        setLoginError(err.response?.data?.message || 'Lỗi kết nối tới máy chủ!');
      });
    } else {
      axios.post(`${API_BASE}/login`, {
        ma_nv: loginMaNv.trim(),
        password: loginPassword
      })
      .then(res => {
        setLoginLoading(false);
        if (res.data?.success) {
          const emp = res.data.data;
          let roleType = 'employee';
          const title = (emp.chuc_danh || '').toLowerCase();
          if (title.includes('giám đốc') || title.includes('giam doc')) {
            roleType = 'admin';
          } else if (title.includes('kế toán') || title.includes('ke toan')) {
            roleType = 'accountant';
          }

          const user = {
            ...emp,
            roleType: roleType,
            roleName: emp.ho_ten,
            username: emp.ma_nv,
            displayTitle: emp.chuc_danh || 'Cán Bộ Nhân Viên'
          };
          setCurrentUser(user);
          localStorage.setItem('sedinco_auth_user', JSON.stringify(user));
          if (roleType === 'employee') {
            setActiveTab('attendance_board');
          } else {
            setActiveTab('dashboard');
          }
        } else {
          setLoginError(res.data?.message || 'Mã nhân viên hoặc mật khẩu không chính xác!');
        }
      })
      .catch(err => {
        setLoginLoading(false);
        setLoginError(err.response?.data?.message || 'Lỗi kết nối tới máy chủ!');
      });
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('sedinco_auth_user');
  };

  const handleCreateEmpLeave = (e) => {
    e.preventDefault();
    if (!currentUser?.ma_nv) return;
    axios.post(`${API_BASE}/requests`, {
      employee_id: currentUser.ma_nv,
      request_type: empLeaveForm.request_type,
      request_date: empLeaveForm.request_date,
      reason: empLeaveForm.reason
    })
    .then(res => {
      if (res.data?.success) {
        alert('Gửi đơn thành công! Đã chuyển về Ban Giám Đốc xét duyệt.');
        setIsEmpLeaveModalOpen(false);
        setEmpLeaveForm({ request_type: 'Nghỉ phép', request_date: '', reason: '' });
        fetchRequests();
      } else {
        alert('Lỗi gửi đơn: ' + (res.data?.message || ''));
      }
    })
    .catch(err => alert('Lỗi kết nối: ' + err.message));
  };

  // 1. Gọi cấu hình công ty 1 lần duy nhất khi ứng dụng vừa load
  useEffect(() => {
    fetchCompanyConfig();
  }, []);

  // 2. Xử lý tải dữ liệu theo từng Tab và bộ lọc
  useEffect(() => {
    if (activeTab === 'dashboard') {
      setLoadingPayroll(true);
      const m = new Date().getMonth() + 1;
      const y = new Date().getFullYear();
      axios.get(`${API_BASE}/payroll?month=${m}&year=${y}`).then(res => { 
        setPayroll(res.data?.data || []); setLoadingPayroll(false); 
      }).catch(() => { setPayroll([]); setLoadingPayroll(false); });
    }
    if (activeTab === 'payroll') {
      setLoadingPayroll(true);
      axios.get(`${API_BASE}/payroll?month=${payrollMonth}&year=${payrollYear}`).then(res => { 
        setPayroll(res.data?.data || []); setLoadingPayroll(false); 
      }).catch(() => { setPayroll([]); setLoadingPayroll(false); });
    }
    if (activeTab === 'employees') fetchEmployees();
    if (activeTab === 'attendance_board') fetchAttendance();
    if (activeTab === 'attendance_requests') fetchRequests();
    if (activeTab === 'company_setup') {
      fetchHolidays(); // Chỉ gọi danh sách ngày lễ, không gọi lại fetchCompanyConfig để tránh reset logo
    }
    
    setIsMobileMenuOpen(false);
  }, [activeTab, payrollMonth, payrollYear, selectedMonth, selectedYear]);

  const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
  const safePayroll = Array.isArray(payroll) ? payroll : [];
  const tongQuyLuongThang = safePayroll.reduce((sum, nv) => sum + (nv.netSalary || 0), 0);

  const handleOpenAdd = () => {
    setFormData({ 
      ma_nv: '', ho_ten: '', ngay_sinh: '', dien_thoai: '', email: '', chuc_danh: '', ngay_bat_dau_lam: '', 
      luong_cb: '', phu_cap_an_trua: '', phu_cap_xang_xe: '', phu_cap_nha_o: '', thuong_htcv: '', 
      phu_cap_trach_nhiem: '', phu_cap_tiep_khach: '', ngay_chinh_thuc: '', has_insurance: true 
    });
    setIsEditing(false); setIsModalOpen(true);
  };
  
  const handleOpenEdit = (emp) => {
    let formattedDate = emp.ngay_chinh_thuc ? new Date(emp.ngay_chinh_thuc).toISOString().split('T')[0] : '';
    let formattedDob = emp.ngay_sinh ? emp.ngay_sinh.split('T')[0] : '';
    let formattedStart = emp.ngay_bat_dau_lam ? emp.ngay_bat_dau_lam.split('T')[0] : '';

    setFormData({ 
      ...emp, 
      ngay_sinh: formattedDob,
      ngay_bat_dau_lam: formattedStart,
      ngay_chinh_thuc: formattedDate, 
      has_insurance: emp.has_insurance !== 0 
    });
    setIsEditing(true); setIsModalOpen(true);
  };

  const handleDelete = (ma_nv) => {
    if (window.confirm(`Xóa nhân viên ${ma_nv}?`)) axios.delete(`${API_BASE}/employees/${ma_nv}`).then(() => fetchEmployees());
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const apiCall = isEditing 
      ? axios.put(`${API_BASE}/employees/${formData.ma_nv}`, formData)
      : axios.post(`${API_BASE}/employees`, formData);
    
    apiCall.then(() => { setIsModalOpen(false); fetchEmployees(); }).catch(err => alert("Lỗi: " + err.message));
  };

  const handleSaveCompany = (e) => {
    e.preventDefault();
    axios.put(`${API_BASE}/company`, companyConfig)
      .then(() => alert('Cập nhật cấu hình công ty thành công!'))
      .catch(err => alert('Lỗi: ' + err.message));
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCompanyConfig(prev => ({ ...prev, logo_url: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveHoliday = (e) => {
    e.preventDefault();
    axios.post(`${API_BASE}/holidays`, holidayForm)
      .then(() => {
        setIsHolidayModalOpen(false);
        setHolidayForm({ holiday_name: '', start_date: '', end_date: '' });
        fetchHolidays();
      })
      .catch(err => alert("Lỗi thêm ngày lễ: " + err.message));
  };

  const handleDeleteHoliday = (id) => {
    if (window.confirm("Xóa ngày lễ này?")) {
      axios.delete(`${API_BASE}/holidays/${id}`).then(() => fetchHolidays());
    }
  };

  const handleCellClick = (empIndex, dayIndex, currentValue, empName) => {
    if (isMultiSelectMode) {
      const cellId = `${empIndex}-${dayIndex}`;
      setSelectedCells(prev => prev.includes(cellId) ? prev.filter(id => id !== cellId) : [...prev, cellId]);
    } else {
      setCellEditModal({ isOpen: true, empIndex, dayIndex, currentValue, empName, dateStr: `${dayIndex + 1}/${selectedMonth}/${selectedYear}` });
    }
  };

  const saveCellEdit = async (newValue, otHours = 0) => {
    const emp = attendanceData[cellEditModal.empIndex];
    const day = cellEditModal.dayIndex + 1;
    const newData = [...attendanceData];
    if(newData[cellEditModal.empIndex].days) newData[cellEditModal.empIndex].days[cellEditModal.dayIndex] = newValue;
    setAttendanceData(newData);
    setCellEditModal({ ...cellEditModal, isOpen: false });
    setOtHoursInputModal({ isOpen: false, statusType: '', hours: 3 });

    try { 
      await axios.post(`${API_BASE}/attendance/update`, { 
        ma_nv: emp.ma_nv, day, month: selectedMonth, year: selectedYear, status: newValue, ot_hours: otHours 
      }); 
    } catch (e) { fetchAttendance(); }
  };

  const saveBulkEdit = async (newValue) => {
    if (selectedCells.length === 0) return;
    const newData = [...attendanceData];
    const promises = selectedCells.map(cellId => {
      const [empIdx, dayIdx] = cellId.split('-').map(Number);
      const emp = newData[empIdx];
      if(emp.days) emp.days[dayIdx] = newValue;
      return axios.post(`${API_BASE}/attendance/update`, { ma_nv: emp.ma_nv, day: dayIdx + 1, month: selectedMonth, year: selectedYear, status: newValue, ot_hours: 4 });
    });
    setAttendanceData(newData);
    setSelectedCells([]);
    setIsMultiSelectMode(false);
    try { await Promise.all(promises); } catch (e) { fetchAttendance(); }
  };

  const simulateSendZalo = () => {
    setZaloModal({ isOpen: true, status: 'processing', logs: ['Khởi tạo tiến trình chốt công...'] });
    setTimeout(() => setZaloModal(prev => ({ ...prev, logs: [...prev.logs, 'Đang tính toán lương nhân sự...'] })), 1000);
    setTimeout(() => setZaloModal(prev => ({ ...prev, logs: [...prev.logs, 'Đang tạo Phiếu lương PDF...'] })), 2000);
    setTimeout(() => setZaloModal(prev => ({ ...prev, logs: [...prev.logs, 'Đang kết nối API Zalo ZNS...'] })), 3000);
    setTimeout(() => {
      const zaloLogs = attendanceData.map(emp => `✅ Đã gửi phiếu lương cho: ${emp.ho_ten} (${emp.ma_nv}) qua Zalo.`);
      setZaloModal(prev => ({ ...prev, status: 'success', logs: [...prev.logs, ...zaloLogs, 'HOÀN TẤT CHỐT CÔNG!'] }));
    }, 4500);
  };

 const handleRequestAction = (id, action) => {
    axios.put(`${API_BASE}/requests/${id}`, { status: action })
      .then(() => {
        // Tìm thông tin đơn được duyệt để lấy tháng/năm của đơn đó
        const targetReq = leaveRequests.find(r => r.id === id);
        if (targetReq && targetReq.date && action === 'approved') {
          // Định dạng ngày từ dd/MM/yyyy sang object Date
          const parts = targetReq.date.split('/');
          if (parts.length === 3) {
            const reqMonth = parseInt(parts[1], 10);
            const reqYear = parseInt(parts[2], 10);
            // Tự động chuyển bảng chấm công sang đúng tháng/năm của đơn
            setSelectedMonth(String(reqMonth));
            setSelectedYear(String(reqYear));
          }
        }

        const updatedRequests = leaveRequests.map(req => req.id === id ? { ...req, status: action } : req);
        setLeaveRequests(updatedRequests);
        fetchAttendance(); 
      });
  };

  const getCellStyles = (val, isSelected) => {
    let base = 'bg-white text-slate-700';
    if (!val) base = 'text-transparent border-slate-100 hover:bg-slate-100'; 
    else if (val === '1' || val === '0.5') base = 'bg-emerald-50 text-emerald-700 font-bold'; 
    else if (val === 'OT' || val === '1/OT') base = 'bg-indigo-50 text-indigo-700 font-bold'; 
    else if (val === 'P') base = 'bg-amber-50 text-amber-600 font-bold'; 
    else if (val === 'KP' || val === 'ERR') base = 'bg-rose-50 text-rose-600 font-bold'; 
    return isSelected ? `${base} ring-2 ring-blue-500 ring-inset shadow-inner z-10` : base;
  };

  const safeYear = parseInt(selectedYear) || 2026;
  const safeMonth = parseInt(selectedMonth) || 10;
  const daysInMonth = new Date(safeYear, safeMonth, 0).getDate() || 31;
  const getDayLabel = (d) => {
    const dayIndex = new Date(safeYear, safeMonth - 1, d).getDay();
    return dayIndex === 0 ? 'CN' : `T${dayIndex + 1}`;
  };

  const isFullAdmin = currentUser?.roleType === 'admin';
  const isAccountant = currentUser?.roleType === 'accountant';
  const isEmployee = currentUser?.roleType === 'employee';

  // NẾU CHƯA ĐĂNG NHẬP: HIỂN THỊ MÀN HÌNH LOGIN
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4 font-sans text-slate-800">
        <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
          {/* Header Card */}
          <div className="p-8 pb-6 text-center border-b border-slate-100 bg-slate-50/50">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white font-extrabold text-2xl shadow-lg shadow-indigo-500/30">
              S
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">SEDINCO HR</h1>
            <p className="text-xs text-slate-500 font-semibold mt-1 uppercase tracking-wider">Hệ thống Quản trị & Chấm công Doanh nghiệp</p>
          </div>

          {/* Role Switch Tabs */}
          <div className="p-6 pt-6">
            <div className="flex bg-slate-100 p-1 rounded-2xl mb-6">
              <button 
                type="button" 
                onClick={() => { setLoginRoleTab('admin'); setLoginError(''); }}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${loginRoleTab === 'admin' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <ShieldCheck size={16} /> Ban Giám Đốc (Admin)
              </button>
              <button 
                type="button" 
                onClick={() => { setLoginRoleTab('employee'); setLoginError(''); }}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${loginRoleTab === 'employee' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <User size={16} /> Nhân Viên / Kế Toán
              </button>
            </div>

            {loginError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {loginRoleTab === 'admin' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Tên Đăng Nhập Quản Trị</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      required 
                      value={loginUsername} 
                      onChange={e => setLoginUsername(e.target.value)} 
                      placeholder="admin"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Mã Nhân Viên</label>
                  <div className="relative">
                    <UserCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      required 
                      value={loginMaNv} 
                      onChange={e => setLoginMaNv(e.target.value)} 
                      placeholder="Ví dụ: NV002"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Mật Khẩu</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="password" 
                    required 
                    value={loginPassword} 
                    onChange={e => setLoginPassword(e.target.value)} 
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loginLoading}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer disabled:opacity-50"
              >
                {loginLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Đăng Nhập Hệ Thống</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Hint */}
            <div className="mt-6 pt-5 border-t border-slate-100">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center mb-2.5">Tài khoản demo sẵn có:</p>
              <div className="flex flex-wrap gap-2 justify-center text-xs">
                {loginRoleTab === 'admin' ? (
                  <button 
                    type="button"
                    onClick={() => { setLoginUsername('admin'); setLoginPassword('123456'); }}
                    className="px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-semibold cursor-pointer"
                  >
                    👑 Giám Đốc (admin / 123456)
                  </button>
                ) : (
                  <>
                    <button 
                      type="button"
                      onClick={() => { setLoginMaNv('NV002'); setLoginPassword('123456'); }}
                      className="px-2.5 py-1.5 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 font-semibold cursor-pointer"
                    >
                      📊 Kế toán (NV002 / 123456)
                    </button>
                    <button 
                      type="button"
                      onClick={() => { setLoginMaNv('NV003'); setLoginPassword('123456'); }}
                      className="px-2.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-semibold cursor-pointer"
                    >
                      🛡️ Bảo vệ (NV003 / 123456)
                    </button>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // ĐÃ ĐĂNG NHẬP THÀNH CÔNG: RENDER DASHBOARD PHÂN QUYỀN
  return (
    <div className="flex h-screen bg-[#F8FAFC] font-sans text-slate-800 overflow-hidden relative">
      {isMobileMenuOpen && <div className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>}
      
      <div className={`fixed inset-y-0 left-0 z-50 w-72 lg:w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'} print:hidden`}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {companyConfig.logo_url ? <img src={companyConfig.logo_url} alt="Logo" className="w-8 h-8 object-contain rounded-lg"/> : <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-md">S</div>}
            <div><h2 className="text-xl font-bold text-slate-800 leading-tight">SEDINCO</h2><p className="text-xs text-slate-500 font-medium">HR Management</p></div>
          </div>
          <button className="lg:hidden p-2 text-slate-400 hover:bg-slate-100 rounded-lg" onClick={() => setIsMobileMenuOpen(false)}><X size={20}/></button>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {/* Admin & Kế toán mới xem Tổng quan */}
          {!isEmployee && (
            <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
              <LayoutDashboard size={20} className={activeTab === 'dashboard' ? 'text-blue-600' : 'text-slate-400'} /> Tổng Quan
            </button>
          )}
          
          {/* Admin & Kế toán mới xem Hồ sơ nhân sự */}
          {!isEmployee && (
            <button onClick={() => setActiveTab('employees')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'employees' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Users size={20} className={activeTab === 'employees' ? 'text-blue-600' : 'text-slate-400'} /> Hồ Sơ Nhân Sự
            </button>
          )}

          <div className="pt-4 pb-1">
            <p className="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              {isEmployee ? 'Chấm công của tôi' : 'Quản lý Chấm công'}
            </p>
            <button onClick={() => setActiveTab('attendance_board')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'attendance_board' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
              <CalendarCheck size={20} className={activeTab === 'attendance_board' ? 'text-indigo-600' : 'text-slate-400'} /> 
              {isEmployee ? 'Bảng Chấm Công Của Tôi' : 'Bảng Chấm Công'}
            </button>
            <button onClick={() => setActiveTab('attendance_requests')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'attendance_requests' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
              <ClipboardCheck size={20} className={activeTab === 'attendance_requests' ? 'text-indigo-600' : 'text-slate-400'} /> 
              {isEmployee ? 'Đơn Từ Của Tôi' : 'Duyệt Đơn Từ'}
              {!isEmployee && leaveRequests.filter(r => r.status === 'pending').length > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{leaveRequests.filter(r => r.status === 'pending').length}</span>
              )}
            </button>
          </div>
          
          <div className="pt-4 pb-1">
            <p className="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              {isEmployee ? 'Thu nhập cá nhân' : 'Tài chính & Hệ thống'}
            </p>
            <button onClick={() => setActiveTab('payroll')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'payroll' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Calculator size={20} className={activeTab === 'payroll' ? 'text-blue-600' : 'text-slate-400'} /> 
              {isEmployee ? 'Phiếu Lương Của Tôi' : 'Bảng Lương Tổng'}
            </button>
            {isFullAdmin && (
              <button onClick={() => setActiveTab('company_setup')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'company_setup' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <Building2 size={20} className={activeTab === 'company_setup' ? 'text-blue-600' : 'text-slate-400'} /> Cấu Hình & Ngày Lễ
              </button>
            )}
          </div>
        </nav>
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 print:hidden z-10 shrink-0">
          <div className="flex items-center w-full max-w-md">
            <button className="lg:hidden p-2 mr-2 text-slate-600 hover:bg-slate-100 rounded-lg" onClick={() => setIsMobileMenuOpen(true)}><Menu size={24} /></button>
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input type="text" placeholder="Tìm kiếm nhanh..." className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium" />
            </div>
          </div>
          <div className="flex items-center gap-3 lg:gap-4 shrink-0">
            <div className="flex items-center gap-2 lg:gap-3 lg:border-l border-slate-200 lg:pl-4">
              <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-md">
                {currentUser?.roleName ? currentUser.roleName.charAt(0).toUpperCase() : (currentUser?.username?.charAt(0).toUpperCase() || 'U')}
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-sm font-bold text-slate-800 leading-none mb-1">
                  {currentUser?.roleName || currentUser?.username}
                </p>
                <span className={`inline-block text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                  isFullAdmin ? 'bg-purple-100 text-purple-700' : (isAccountant ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600')
                }`}>
                  {currentUser?.displayTitle || 'Nhân viên'}
                </span>
              </div>
            </div>

            <button 
              onClick={handleLogout} 
              title="Đăng xuất khỏi hệ thống"
              className="flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 relative">
          
          {activeTab === 'dashboard' && (
            <div className="max-w-7xl mx-auto space-y-6">
              <div><h1 className="text-2xl font-bold text-slate-800">Tổng Quan Hệ Thống</h1></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
                <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-2xl shadow-md text-white relative overflow-hidden">
                  <TrendingUp className="text-blue-200 mb-3" size={28} />
                  <p className="text-blue-100 text-sm font-semibold uppercase tracking-wider">Quỹ Lương Thực Tế</p>
                  <h3 className="text-3xl font-bold mt-1">{loadingPayroll ? "..." : formatCurrency(tongQuyLuongThang)}</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <CheckCircle2 className="text-emerald-500 mb-3" size={28} />
                  <p className="text-slate-500 text-sm font-semibold uppercase tracking-wider">Nhân sự đi làm</p>
                  <h3 className="text-3xl font-bold text-slate-800 mt-1">{(employees||[]).length} <span className="text-sm font-medium text-slate-400">người</span></h3>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'employees' && (
            <div className="max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between sm:items-end mb-6 gap-4">
                <div><h1 className="text-2xl font-bold text-slate-800">Quản Lý Nhân Sự</h1></div>
                <button onClick={handleOpenAdd} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 font-semibold shadow-sm hover:bg-blue-700 shrink-0"><Plus size={18} /> Thêm Mới</button>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 w-full overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-[#F8FAFC] text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                      <th className="p-4 font-bold">Mã NV</th><th className="p-4 font-bold">Họ & Tên</th><th className="p-4 font-bold">Chức danh</th><th className="p-4 font-bold text-right">Lương Cơ Bản</th><th className="p-4 font-bold text-right">Tổng Phụ Cấp</th><th className="p-4 font-bold text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingEmp ? <tr><td colSpan="6" className="p-10 text-center">Đang tải...</td></tr> : 
                     (employees||[]).map(emp => {
                      const tongPhuCap = (Number(emp.phu_cap_an_trua)||0) + (Number(emp.phu_cap_xang_xe)||0) + (Number(emp.phu_cap_nha_o)||0) + (Number(emp.thuong_htcv)||0) + (Number(emp.phu_cap_trach_nhiem)||0) + (Number(emp.phu_cap_tiep_khach)||0);
                      return (
                      <tr key={emp.ma_nv} className="hover:bg-slate-50">
                        <td className="p-4 font-bold text-slate-700">{emp.ma_nv}</td>
                        <td className="p-4 font-medium">{emp.ho_ten}</td>
                        <td className="p-4 text-slate-600 text-sm">{emp.chuc_danh || '-'}</td>
                        <td className="p-4 text-right">{formatCurrency(emp.luong_cb)}</td>
                        <td className="p-4 text-right">{formatCurrency(tongPhuCap)}</td>
                        <td className="p-4 text-center flex justify-center gap-2">
                          <button onClick={() => handleOpenEdit(emp)} className="text-blue-500 bg-blue-50 p-2 rounded-lg"><Edit size={18}/></button>
                          <button onClick={() => handleDelete(emp.ma_nv)} className="text-red-500 bg-red-50 p-2 rounded-lg"><Trash2 size={18}/></button>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'attendance_board' && (
            <div className="w-full">
              <div className="flex flex-col md:flex-row justify-between md:items-end mb-6 print:hidden gap-4">
                <div><h1 className="text-2xl font-bold text-slate-800">Bảng Chấm Công</h1></div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex gap-2 bg-white p-1 rounded-xl border border-slate-200">
                    <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-transparent font-semibold text-slate-700 outline-none px-2 py-1">
                      {Array.from({length: 12}, (_, i) => <option key={i+1} value={i+1}>Tháng {i+1}</option>)}
                    </select>
                    <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="bg-transparent font-semibold text-slate-700 outline-none px-2 py-1 border-l border-slate-200">
                      <option value="2026">2026</option><option value="2027">2027</option>
                    </select>
                  </div>
                  
                  {!isEmployee && (
                    <button onClick={() => { setIsMultiSelectMode(!isMultiSelectMode); setSelectedCells([]); }} 
                      className={`px-4 py-2.5 rounded-xl flex items-center gap-2 font-bold transition ${isMultiSelectMode ? 'bg-blue-100 text-blue-700 border-blue-300 border' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                      <CheckSquare size={18} /> {isMultiSelectMode ? 'Tắt chọn nhiều' : 'Chọn nhiều ô'}
                    </button>
                  )}

                  <button onClick={() => window.print()} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-semibold hover:bg-indigo-700 shrink-0">
                    <Printer size={18} /> In Bảng Công
                  </button>
                  
                  {!isEmployee && (
                    <button onClick={simulateSendZalo} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-semibold hover:bg-emerald-700 shrink-0">
                      <Send size={18} /> Chốt & Zalo
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 w-full overflow-x-auto print:border-none print:shadow-none print:overflow-visible relative">
                {/* HEADER KHI IN BẢNG CHẤM CÔNG CÓ LOGO VÀ THÔNG TIN CÔNG TY */}
                <div className="hidden print:flex items-center justify-between mb-6 pb-4 border-b border-slate-300">
                  <div className="flex items-center gap-3">
                    {companyConfig.logo_url && <img src={companyConfig.logo_url} alt="Logo" className="w-12 h-12 object-contain" />}
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">{companyConfig.company_name || 'Sedinco HR'}</h3>
                      <p className="text-xs text-slate-600">ĐC: {companyConfig.address} | SĐT: {companyConfig.phone}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-xl font-bold uppercase text-slate-800">BẢNG CHẤM CÔNG</h2>
                    <p className="text-xs text-slate-600">Tháng {selectedMonth}/{selectedYear}</p>
                  </div>
                </div>

                <table className="w-full text-center border-collapse table-fixed text-[10px] xl:text-xs min-w-[700px]">
                  <thead>
                    <tr className="bg-[#F8FAFC] text-slate-600 font-bold border-b border-slate-200 print:bg-transparent">
                      <th className="p-1.5 xl:p-2 border-r border-slate-200 w-[120px] xl:w-[150px] text-left">Nhân viên</th>
                      {Array.from({length: daysInMonth}).map((_, i) => (
                        <th key={i} className={`p-0.5 xl:p-1 border-r border-slate-200 max-w-[28px] ${getDayLabel(i+1) === 'CN' ? 'bg-rose-50 text-rose-500' : ''}`}>
                          <div className="text-[8px] xl:text-[10px] font-normal opacity-70 leading-none mb-0.5">{getDayLabel(i+1)}</div>{i+1}
                        </th>
                      ))}
                      <th className="p-1.5 xl:p-2 border-l border-slate-200 w-[40px] xl:w-[50px] bg-emerald-50 text-emerald-700">Tổng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const visibleEmps = isEmployee 
                        ? (attendanceData||[]).filter(emp => emp.ma_nv === currentUser?.ma_nv)
                        : (attendanceData||[]);
                      if (visibleEmps.length === 0) {
                        return <tr><td colSpan={daysInMonth+2} className="py-10 text-slate-400">Không có dữ liệu chấm công...</td></tr>;
                      }
                      return visibleEmps.map((emp, empIdx) => {
                        let total = 0;
                        (emp.days||[]).slice(0, daysInMonth).forEach(d => { if(d === '1' || d === '1/OT') total+=1; else if(d === '0.5') total+=0.5; });
                        return (
                        <tr key={emp.ma_nv} className="hover:bg-slate-50 transition">
                          <td className="p-1.5 xl:p-2 border-r border-slate-200 text-left truncate"><div className="font-bold text-slate-800 truncate" title={emp.ho_ten}>{emp.ho_ten}</div><div className="text-[9px] text-slate-500">{emp.ma_nv}</div></td>
                          {Array.from({length: daysInMonth}).map((_, dayIdx) => {
                            const val = (emp.days && emp.days[dayIdx]) ? emp.days[dayIdx] : ''; 
                            const isSunday = getDayLabel(dayIdx + 1) === 'CN';
                            const isSelected = selectedCells.includes(`${empIdx}-${dayIdx}`);
                            return (
                            <td key={dayIdx} onClick={() => { if (!isEmployee) handleCellClick(empIdx, dayIdx, val, emp.ho_ten); }} className={`border-r border-slate-100 ${!isEmployee ? 'cursor-pointer' : 'cursor-default'} p-0 group ${isSunday ? 'bg-slate-50' : ''}`}>
                              <div className={`w-full h-[24px] xl:h-[32px] flex items-center justify-center transition-all ${getCellStyles(val, isSelected)} ${isSunday && !val && !isSelected ? 'bg-transparent text-transparent border-transparent' : ''}`}>
                                {val === '1/OT' ? (
                                  <div className="flex flex-col items-center justify-center h-full leading-none font-bold">
                                    <span className="text-emerald-700 text-[10px]">1</span>
                                    <span className="text-indigo-600 text-[8px]">OT</span>
                                  </div>
                                ) : val}
                              </div>
                            </td>
                          )})}
                          <td className="p-1.5 xl:p-2 font-bold text-emerald-600 border-l border-slate-200 bg-emerald-50/50">{total}</td>
                        </tr>
                      );});
                    })()}
                  </tbody>
                </table>
                <div className="hidden print:flex justify-between mt-12 px-20 pb-10">
                  <div className="text-center"><p className="font-bold text-lg">Người lập biểu</p><p className="italic text-sm">(Ký, ghi rõ họ tên)</p></div>
                  <div className="text-center"><p className="font-bold text-lg">Giám đốc nhà máy</p><p className="italic text-sm">(Ký, ghi rõ họ tên)</p></div>
                </div>
              </div>

              {isMultiSelectMode && selectedCells.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white px-6 py-4 rounded-2xl shadow-2xl border border-blue-200 flex items-center gap-4 animate-in slide-in-from-bottom-5 z-40 print:hidden">
                  <div className="font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">Đã chọn {selectedCells.length} ô</div>
                  <div className="w-px h-8 bg-slate-200 mx-2"></div>
                  <button onClick={() => saveBulkEdit('1')} className="px-3 py-2 bg-emerald-50 text-emerald-700 font-bold rounded-lg hover:bg-emerald-100 border border-emerald-200">Đủ (1)</button>
                  <button onClick={() => saveBulkEdit('OT')} className="px-3 py-2 bg-indigo-50 text-indigo-700 font-bold rounded-lg hover:bg-indigo-100 border border-indigo-200">Làm thêm (OT)</button>
                  <button onClick={() => saveBulkEdit('1/OT')} className="px-3 py-2 bg-blue-50 text-blue-700 font-bold rounded-lg hover:bg-blue-100 border border-blue-200">1 + OT</button>
                  <button onClick={() => saveBulkEdit('P')} className="px-3 py-2 bg-amber-50 text-amber-600 font-bold rounded-lg hover:bg-amber-100 border border-amber-200">Phép (P)</button>
                  <button onClick={() => saveBulkEdit('')} className="px-3 py-2 bg-slate-100 text-slate-500 font-bold rounded-lg hover:bg-slate-200 border border-slate-300">Xóa</button>
                  <button onClick={() => setSelectedCells([])} className="p-2 text-slate-400 hover:text-slate-600 bg-slate-50 rounded-lg ml-2"><X size={20}/></button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'company_setup' && (
            <div className="max-w-4xl mx-auto space-y-8 pb-12">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Building2 className="text-blue-600" size={20}/> Thông Tin Doanh Nghiệp & Logo</h2>
                <form onSubmit={handleSaveCompany} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Tên công ty *</label>
                      <input type="text" required value={companyConfig.company_name || ''} onChange={e => setCompanyConfig({...companyConfig, company_name: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none font-medium text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Số điện thoại *</label>
                      <input type="text" required value={companyConfig.phone || ''} onChange={e => setCompanyConfig({...companyConfig, phone: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none font-medium text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Mã số thuế *</label>
                      <input type="text" required value={companyConfig.tax_code || ''} onChange={e => setCompanyConfig({...companyConfig, tax_code: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none font-medium text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Tải lên Logo Công Ty</label>
                      <div className="flex items-center gap-3">
                        <label className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer text-xs font-bold flex items-center gap-2 border border-slate-300">
                          <Upload size={14}/> Chọn ảnh logo
                          <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        </label>
                        {companyConfig.logo_url && <img src={companyConfig.logo_url} alt="Logo" className="w-10 h-10 object-contain rounded-lg border bg-white" />}
                      </div>
                    </div>
                    <div className="col-span-1 sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Địa chỉ trụ sở *</label>
                      <input type="text" required value={companyConfig.address || ''} onChange={e => setCompanyConfig({...companyConfig, address: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none font-medium text-sm" />
                    </div>
                  </div>
                  <div className="pt-2 flex justify-end">
                    <button type="submit" className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 shadow-md hover:bg-blue-700 text-sm">
                      <Save size={16}/> Lưu Thông Tin Công Ty
                    </button>
                  </div>
                </form>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><CalendarDays className="text-indigo-600" size={20}/> Quản Lý Lịch Nghỉ Lễ (Hệ số x3)</h2>
                  <button onClick={() => setIsHolidayModalOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-semibold text-xs hover:bg-indigo-700"><Plus size={16} /> Thêm Ngày Lễ</button>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F8FAFC] text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                      <th className="p-3 font-bold">Tên kỳ nghỉ lễ</th>
                      <th className="p-3 font-bold">Từ ngày</th>
                      <th className="p-3 font-bold">Đến ngày</th>
                      <th className="p-3 font-bold text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {holidays.length === 0 ? (
                      <tr><td colSpan="4" className="p-6 text-center text-slate-400 font-bold">Chưa có ngày lễ nào</td></tr>
                    ) : (
                      holidays.map(h => (
                        <tr key={h.id} className="hover:bg-slate-50">
                          <td className="p-3 font-bold text-slate-800">{h.holiday_name}</td>
                          <td className="p-3 text-slate-600">{h.start_date ? h.start_date.split('T')[0] : ''}</td>
                          <td className="p-3 text-slate-600">{h.end_date ? h.end_date.split('T')[0] : ''}</td>
                          <td className="p-3 text-center">
                            <button onClick={() => handleDeleteHoliday(h.id)} className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100"><Trash2 size={14}/></button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'attendance_requests' && (
             <div className="max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between sm:items-end mb-6 gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-800">{isEmployee ? 'Đơn Từ Của Tôi' : 'Duyệt Đơn & Cập Nhật Công'}</h1>
                  <p className="text-slate-500 mt-1">
                    {isEmployee 
                      ? 'Theo dõi trạng thái các đơn xin nghỉ phép, làm thêm giờ (OT) hoặc báo quên chấm công của bạn.' 
                      : 'Danh sách các yêu cầu xin nghỉ phép, báo quên chấm công, đăng ký làm thêm (OT) từ nhân viên.'}
                  </p>
                </div>
                {isEmployee && (
                  <button 
                    onClick={() => setIsEmpLeaveModalOpen(true)} 
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold shadow-md shrink-0 cursor-pointer text-sm"
                  >
                    <Plus size={18} /> Tạo Đơn Mới
                  </button>
                )}
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-[#F8FAFC] text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                      <th className="p-4 font-bold">Nhân viên</th>
                      <th className="p-4 font-bold">Loại đơn</th>
                      <th className="p-4 font-bold">Thời gian</th>
                      <th className="p-4 font-bold">Lý do</th>
                      <th className="p-4 font-bold">Trạng thái</th>
                      <th className="p-4 font-bold text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const visibleRequests = isEmployee 
                        ? (leaveRequests||[]).filter(r => r.ma_nv === currentUser?.ma_nv) 
                        : (leaveRequests||[]);
                      if (loadingRequests) {
                        return <tr><td colSpan="6" className="p-10 text-center text-slate-500">Đang tải dữ liệu đơn...</td></tr>;
                      }
                      if (visibleRequests.length === 0) {
                        return (
                          <tr>
                            <td colSpan="6" className="p-16 text-center">
                              <div className="flex flex-col items-center justify-center text-slate-400">
                                <ClipboardCheck size={56} className="mb-4 text-slate-300" />
                                <p className="text-lg font-bold text-slate-600">{isEmployee ? 'Bạn chưa có đơn từ nào' : 'Không có đơn nào cần xử lý'}</p>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      return visibleRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-slate-50 transition">
                          <td className="p-4"><div className="font-bold text-slate-800">{req.ho_ten}</div><div className="text-xs text-slate-500">{req.ma_nv}</div></td>
                          <td className="p-4"><span className="px-3 py-1 rounded-full text-xs font-bold border bg-blue-50 text-blue-600 border-blue-200">{req.type}</span></td>
                          <td className="p-4 font-medium text-slate-700">{req.date}</td>
                          <td className="p-4 text-slate-600 max-w-xs truncate" title={req.reason}>{req.reason}</td>
                          <td className="p-4">
                            {req.status === 'pending' && <span className="flex items-center gap-1 text-orange-500 font-medium text-sm"><AlertCircle size={16}/> Chờ duyệt</span>}
                            {req.status === 'approved' && <span className="flex items-center gap-1 text-emerald-600 font-medium text-sm"><CheckCircle2 size={16}/> Đã duyệt</span>}
                            {req.status === 'rejected' && <span className="flex items-center gap-1 text-rose-600 font-medium text-sm"><XCircle size={16}/> Từ chối</span>}
                          </td>
                          <td className="p-4 text-center">
                            {!isEmployee ? (
                              req.status === 'pending' ? (
                                <div className="flex justify-center gap-2">
                                  <button onClick={() => handleRequestAction(req.id, 'approved')} className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 p-2 rounded-lg font-bold cursor-pointer" title="Duyệt"><Check size={16}/></button>
                                  <button onClick={() => handleRequestAction(req.id, 'rejected')} className="bg-rose-50 text-rose-600 hover:bg-rose-100 p-2 rounded-lg font-bold cursor-pointer" title="Từ chối"><X size={16}/></button>
                                </div>
                              ) : <span className="text-slate-400 text-sm italic">Đã xử lý</span>
                            ) : (
                              <span className="text-xs font-semibold text-slate-500">{req.status === 'pending' ? 'Chờ BQL duyệt' : 'Đã phản hồi'}</span>
                            )}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'payroll' && (
             <div className="max-w-7xl mx-auto">
              <div className="flex flex-col md:flex-row justify-between md:items-end mb-6 print:hidden gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-800">{isEmployee ? 'Phiếu Lương Cá Nhân' : 'Bảng Lương Tổng Hợp'}</h1>
                  {isEmployee && <p className="text-sm text-slate-500 mt-1 font-medium">{currentUser?.roleName} - {currentUser?.displayTitle}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex gap-2 bg-white p-1 rounded-xl border border-slate-200">
                    <select value={payrollMonth} onChange={e => setPayrollMonth(e.target.value)} className="bg-transparent font-semibold text-slate-700 outline-none px-2 py-1">
                      {Array.from({length: 12}, (_, i) => <option key={i+1} value={i+1}>Tháng {i+1}</option>)}
                    </select>
                    <select value={payrollYear} onChange={e => setPayrollYear(e.target.value)} className="bg-transparent font-semibold text-slate-700 outline-none px-2 py-1 border-l border-slate-200">
                      <option value="2026">2026</option><option value="2027">2027</option>
                    </select>
                  </div>
                  <button onClick={() => window.print()} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-semibold hover:bg-blue-700 shrink-0 cursor-pointer">
                    <Printer size={18} /> In {isEmployee ? 'Phiếu Lương' : 'Bảng Lương'}
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 w-full overflow-x-auto print:border-none print:shadow-none print:overflow-visible">
                {/* HEADER KHI IN BẢNG LƯƠNG CÓ LOGO VÀ THÔNG TIN CÔNG TY */}
                <div className="hidden print:flex items-center justify-between mb-6 pb-4 border-b border-slate-300">
                  <div className="flex items-center gap-3">
                    {companyConfig.logo_url && <img src={companyConfig.logo_url} alt="Logo" className="w-12 h-12 object-contain" />}
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">{companyConfig.company_name || 'Sedinco HR'}</h3>
                      <p className="text-xs text-slate-600">ĐC: {companyConfig.address} | MST: {companyConfig.tax_code}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-xl font-bold uppercase text-slate-800">{isEmployee ? 'PHIẾU LƯƠNG CÁ NHÂN' : 'BẢNG THANH TOÁN LƯƠNG'}</h2>
                    <p className="text-xs text-slate-600">Tháng {payrollMonth}/{payrollYear}</p>
                  </div>
                </div>

                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-[#F8FAFC] text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                      <th className="p-4 font-bold">Mã NV</th><th className="p-4 font-bold">Họ & Tên</th><th className="p-4 font-bold text-center">Ngày Công</th>
                      <th className="p-4 font-bold text-right">Lương CB</th><th className="p-4 font-bold text-right">Lương Công</th><th className="p-4 font-bold text-right">Phụ Cấp</th>
                      <th className="p-4 font-bold text-right text-indigo-600">Tiền OT</th><th className="p-4 font-bold text-right">Khấu Trừ</th><th className="p-4 font-bold text-right text-blue-600">Thực Lĩnh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const visiblePayroll = isEmployee 
                        ? (safePayroll||[]).filter(nv => nv.id_nhan_vien === currentUser?.ma_nv)
                        : (safePayroll||[]);
                      if (loadingPayroll) return <tr><td colSpan="9" className="p-10 text-center">Đang tải...</td></tr>;
                      if (visiblePayroll.length === 0) return <tr><td colSpan="9" className="p-10 text-center text-slate-400">Không có dữ liệu bảng lương...</td></tr>;
                      return visiblePayroll.map(nv => (
                        <tr key={nv.id_nhan_vien} className="hover:bg-slate-50">
                          <td className="p-4 font-semibold text-slate-700">{nv.id_nhan_vien}</td><td className="p-4 font-medium">{nv.ho_ten}</td>
                          <td className="p-4 text-center">{nv.totalWorkDays}</td>
                          <td className="p-4 text-right">{formatCurrency(nv.baseSalary)}</td>
                          <td className="p-4 text-right">{formatCurrency(nv.salaryByWork)}</td>
                          <td className="p-4 text-right">{formatCurrency(nv.totalAllowance)}</td>
                          <td className="p-4 text-right font-medium text-indigo-600">{formatCurrency(nv.otAmount)}</td>
                          <td className="p-4 text-right text-rose-500 font-medium">-{formatCurrency(nv.totalInsurance)}</td>
                          <td className="p-4 text-right font-bold text-blue-600 text-lg">{formatCurrency(nv.netSalary)}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}


          {/* MODAL THÊM / SỬA NHÂN SỰ */}
          {isModalOpen && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 print:hidden p-4">
              <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-[#F8FAFC]">
                  <h3 className="text-lg font-bold text-slate-800">{isEditing ? 'Sửa thông tin nhân viên' : 'Thêm nhân viên mới'}</h3>
                  <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1 rounded-lg"><X size={20}/></button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Mã NV *</label>
                      <input type="text" required readOnly={isEditing} value={formData.ma_nv} onChange={e => setFormData({...formData, ma_nv: e.target.value})} className={`w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 ${isEditing ? 'bg-slate-100' : ''}`} />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Họ và Tên *</label>
                      <input type="text" required value={formData.ho_ten} onChange={e => setFormData({...formData, ho_ten: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Ngày sinh</label>
                      <input type="date" value={formData.ngay_sinh} onChange={e => setFormData({...formData, ngay_sinh: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Số điện thoại</label>
                      <input type="text" placeholder="VD: 0905123456" value={formData.dien_thoai} onChange={e => setFormData({...formData, dien_thoai: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
                      <input type="email" placeholder="nhanvien@sedinco.vn" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Chức danh</label>
                      <input type="text" placeholder="VD: Chuyên viên Nhân sự" value={formData.chuc_danh} onChange={e => setFormData({...formData, chuc_danh: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Ngày bắt đầu làm việc</label>
                      <input type="date" value={formData.ngay_bat_dau_lam} onChange={e => setFormData({...formData, ngay_bat_dau_lam: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Ngày kết thúc thử việc</label>
                      <input type="date" value={formData.ngay_chinh_thuc} onChange={e => setFormData({...formData, ngay_chinh_thuc: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                    </div>

                    <div className="col-span-1 sm:col-span-2">
                      <label className="block text-sm font-bold text-slate-700 mb-1">Lương Cơ Bản *</label>
                      <input type="number" required value={formData.luong_cb} onChange={e => setFormData({...formData, luong_cb: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>

                    <div className="col-span-1 sm:col-span-2 flex items-center mt-2">
                      <input type="checkbox" id="hasIns" checked={formData.has_insurance} onChange={e => setFormData({...formData, has_insurance: e.target.checked})} className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"/>
                      <label htmlFor="hasIns" className="ml-2 text-sm font-bold text-slate-700 cursor-pointer">Đóng Bảo Hiểm (Khấu trừ 10.5%)</label>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 border-b border-slate-100 pb-2">Chi tiết phụ cấp</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div><label className="block text-sm font-medium mb-1">Ăn trưa</label><input type="number" value={formData.phu_cap_an_trua} onChange={e => setFormData({...formData, phu_cap_an_trua: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" /></div>
                      <div><label className="block text-sm font-medium mb-1">Xăng xe</label><input type="number" value={formData.phu_cap_xang_xe} onChange={e => setFormData({...formData, phu_cap_xang_xe: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" /></div>
                      <div><label className="block text-sm font-medium mb-1">Nhà ở</label><input type="number" value={formData.phu_cap_nha_o} onChange={e => setFormData({...formData, phu_cap_nha_o: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" /></div>
                      <div><label className="block text-sm font-medium mb-1">Thưởng HTCV</label><input type="number" value={formData.thuong_htcv} onChange={e => setFormData({...formData, thuong_htcv: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" /></div>
                      <div><label className="block text-sm font-medium mb-1">Trách nhiệm</label><input type="number" value={formData.phu_cap_trach_nhiem} onChange={e => setFormData({...formData, phu_cap_trach_nhiem: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" /></div>
                      <div><label className="block text-sm font-medium mb-1">Tiếp khách</label><input type="number" value={formData.phu_cap_tiep_khach} onChange={e => setFormData({...formData, phu_cap_tiep_khach: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    </div>
                  </div>
                  <div className="pt-2 flex flex-col sm:flex-row gap-3">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="w-full sm:w-1/2 px-4 py-2.5 bg-white border border-slate-300 rounded-xl font-bold hover:bg-slate-50">Hủy</button>
                    <button type="submit" className="w-full sm:w-1/2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700">Lưu Thông Tin</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MODAL THÊM NGÀY LỄ */}
          {isHolidayModalOpen && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 print:hidden p-4">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-800 text-lg">Thêm kỳ nghỉ lễ mới</h3>
                  <button onClick={() => setIsHolidayModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                </div>
                <form onSubmit={handleSaveHoliday} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Tên kỳ nghỉ lễ *</label>
                    <input type="text" required placeholder="Ví dụ: Giỗ Tổ Hùng Vương" value={holidayForm.holiday_name} onChange={e => setHolidayForm({...holidayForm, holiday_name: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none font-medium text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Từ ngày *</label>
                    <input type="date" required value={holidayForm.start_date} onChange={e => setHolidayForm({...holidayForm, start_date: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none font-medium text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Đến ngày *</label>
                    <input type="date" required value={holidayForm.end_date} onChange={e => setHolidayForm({...holidayForm, end_date: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none font-medium text-sm" />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button type="button" onClick={() => setIsHolidayModalOpen(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm">Hủy</button>
                    <button type="submit" className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-md">Lưu ngày lễ</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* POPUP CHỌN TRẠNG THÁI CHẤM CÔNG */}
          {cellEditModal.isOpen && !isMultiSelectMode && !otHoursInputModal.isOpen && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 print:hidden p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden">
                <div className="p-4 md:p-5 border-b border-slate-100 flex justify-between items-center bg-[#F8FAFC]">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Cập nhật công</h3>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">{cellEditModal.empName} - Ngày {cellEditModal.dateStr}</p>
                  </div>
                  <button onClick={() => setCellEditModal({ ...cellEditModal, isOpen: false })} className="text-slate-400 bg-slate-100 p-1.5 rounded-lg"><X size={20}/></button>
                </div>
                <div className="p-4 md:p-5 grid grid-cols-2 gap-3">
                  <button onClick={() => saveCellEdit('1', 0)} className="py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-xl font-bold flex flex-col items-center"><span className="text-xl">1</span><span className="text-[10px] uppercase">Đủ công</span></button>
                  <button onClick={() => saveCellEdit('0.5', 0)} className="py-3 bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 rounded-xl font-bold flex flex-col items-center"><span className="text-xl">0.5</span><span className="text-[10px] uppercase">Nửa ngày</span></button>
                  <button onClick={() => setOtHoursInputModal({ isOpen: true, statusType: 'OT', hours: 3 })} className="py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 rounded-xl font-bold flex flex-col items-center"><span className="text-xl">OT</span><span className="text-[10px] uppercase">Làm thêm</span></button>
                  <button onClick={() => saveCellEdit('P', 0)} className="py-3 bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 rounded-xl font-bold flex flex-col items-center"><span className="text-xl">P</span><span className="text-[10px] uppercase">Có phép</span></button>
                </div>
              </div>
            </div>
          )}

          {/* SUB-POPUP CHỌN GIỜ OT */}
          {otHoursInputModal.isOpen && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 print:hidden p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><Clock size={18} className="text-indigo-600"/> Chọn số giờ làm thêm</h3>
                  <button onClick={() => setOtHoursInputModal({ isOpen: false, statusType: '', hours: 3 })} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                </div>
                <div className="mb-6">
                  <input type="number" step="0.5" min="0.5" max="24" value={otHoursInputModal.hours} onChange={e => setOtHoursInputModal({ ...otHoursInputModal, hours: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl font-bold text-lg text-center outline-none" />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setOtHoursInputModal({ isOpen: false, statusType: '', hours: 3 })} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm">Hủy</button>
                  <button onClick={() => saveCellEdit(otHoursInputModal.statusType, otHoursInputModal.hours)} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg">Xác nhận</button>
                </div>
              </div>
            </div>
          )}

          {zaloModal.isOpen && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 text-center">
                {zaloModal.status === 'processing' ? <div className="w-16 h-16 border-4 border-slate-100 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div> : <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle2 size={32} /></div>}
                <h3 className="text-xl font-bold text-slate-800 mb-2">Tiến trình Chốt Công</h3>
                <div className="bg-slate-900 text-emerald-400 text-left p-4 rounded-xl text-xs font-mono h-48 overflow-y-auto mt-4 space-y-2">
                  {zaloModal.logs.map((log, idx) => <div key={idx}>{'>'} {log}</div>)}
                </div>
                {zaloModal.status === 'success' && <button onClick={() => setZaloModal({isOpen: false, status: '', logs: []})} className="mt-6 w-full py-3 bg-slate-800 text-white font-bold rounded-xl">Đóng</button>}
              </div>
            </div>
          )}

          {/* MODAL TẠO ĐƠN NGHỈ PHÉP / OT CHO NHÂN VIÊN */}
          {isEmpLeaveModalOpen && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-[#F8FAFC]">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Tạo Đơn Xin Phép / Báo Công</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Nhân viên: <strong className="text-blue-600">{currentUser?.roleName}</strong> ({currentUser?.ma_nv})</p>
                  </div>
                  <button 
                    onClick={() => setIsEmpLeaveModalOpen(false)} 
                    className="text-slate-400 hover:text-slate-600 bg-slate-100 p-2 rounded-xl transition-all cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
                <form onSubmit={handleCreateEmpLeave} className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Loại Đơn *</label>
                    <select 
                      value={empLeaveForm.request_type} 
                      onChange={e => setEmpLeaveForm({ ...empLeaveForm, request_type: e.target.value })} 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    >
                      <option value="Nghỉ phép">Nghỉ phép thường niên (Có phép - P)</option>
                      <option value="Quên chấm công">Quên chấm công / Bổ sung công</option>
                      <option value="Làm thêm giờ (OT)">Đăng ký làm thêm ngoài giờ (OT)</option>
                      <option value="Nghỉ ốm / thai sản">Nghỉ ốm / Khám bệnh / Thai sản</option>
                      <option value="Nghỉ việc riêng">Nghỉ việc riêng không hưởng lương</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Ngày Áp Dụng *</label>
                    <input 
                      type="date" 
                      required 
                      value={empLeaveForm.request_date} 
                      onChange={e => setEmpLeaveForm({ ...empLeaveForm, request_date: e.target.value })} 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Lý Do Chi Tiết *</label>
                    <textarea 
                      required 
                      rows={3} 
                      placeholder="Nhập lý do cụ thể gửi ban quản lý xét duyệt..." 
                      value={empLeaveForm.reason} 
                      onChange={e => setEmpLeaveForm({ ...empLeaveForm, reason: e.target.value })} 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white resize-none" 
                    />
                  </div>
                  <div className="flex gap-3 pt-3">
                    <button 
                      type="button" 
                      onClick={() => setIsEmpLeaveModalOpen(false)} 
                      className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-sm transition-all cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button 
                      type="submit" 
                      className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
                    >
                      Gửi Lên Ban Quản Lý
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

export default App;