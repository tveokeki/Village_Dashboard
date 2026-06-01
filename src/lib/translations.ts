export type Lang = "th" | "en";

const translations = {
  // Common
  appName: { th: "สวนเอก เลคปาร์ควิลล่า", en: "Suan Eak Lake Park Villa" },
  dashboard: { th: "แดชบอร์ด", en: "Dashboard" },
  announcements: { th: "ประกาศ", en: "Announcements" },
  tickets: { th: "รายการปัญหา", en: "Problem Tickets" },
  documents: { th: "เอกสาร", en: "Documents" },
  profile: { th: "โปรไฟล์", en: "Profile" },
  settings: { th: "ตั้งค่า", en: "Settings" },
  logout: { th: "ออกจากระบบ", en: "Logout" },
  login: { th: "เข้าสู่ระบบ", en: "Sign In" },
  welcome: { th: "สวัสดี", en: "Welcome" },
  welcomeBack: { th: "ยินดีต้อนรับกลับ", en: "Welcome back" },
  
  // Auth
  email: { th: "อีเมล", en: "Email" },
  password: { th: "รหัสผ่าน", en: "Password" },
  confirmPassword: { th: "ยืนยันรหัสผ่าน", en: "Confirm Password" },
  forgotPassword: { th: "ลืมรหัสผ่าน?", en: "Forgot Password?" },
  resetPassword: { th: "รีเซ็ตรหัสผ่าน", en: "Reset Password" },
  changePassword: { th: "เปลี่ยนรหัสผ่าน", en: "Change Password" },
  currentPassword: { th: "รหัสผ่านปัจจุบัน", en: "Current Password" },
  newPassword: { th: "รหัสผ่านใหม่", en: "New Password" },
  loginWithLine: { th: "เข้าสู่ระบบด้วย LINE", en: "Sign in with LINE" },
  loginWithGoogle: { th: "เข้าสู่ระบบด้วย Google", en: "Sign in with Google" },
  or: { th: "หรือ", en: "or" },
  register: { th: "สมัครสมาชิก", en: "Register" },
  noAccount: { th: "ยังไม่มีบัญชี?", en: "Don't have an account?" },
  hasAccount: { th: "มีบัญชีแล้ว?", en: "Already have an account?" },
  fullName: { th: "ชื่อ-นามสกุล", en: "Full Name" },
  houseNumber: { th: "บ้านเลขที่", en: "House Number" },
  lineId: { th: "LINE ID (ไม่บังคับ)", en: "LINE ID (optional)" },
  sendResetLink: { th: "ส่งลิงก์รีเซ็ต", en: "Send Reset Link" },
  
  // Dashboard
  latestAnnouncements: { th: "📢 ประกาศล่าสุด", en: "📢 Latest Announcements" },
  quickDownloads: { th: "📄 เอกสาร", en: "📄 Quick Downloads" },
  viewAll: { th: "ดูทั้งหมด →", en: "View All →" },
  
  // Status
  received: { th: "รอดำเนินการ", en: "Pending" },
  inProgress: { th: "กำลังแก้ไข", en: "In Progress" },
  resolved: { th: "เสร็จสิ้น", en: "Resolved" },
  closed: { th: "ปิด", en: "Closed" },
  
  // Priority
  low: { th: "ต่ำ", en: "Low" },
  normal: { th: "ปกติ", en: "Normal" },
  high: { th: "สูง", en: "High" },
  urgent: { th: "เร่งด่วน", en: "Urgent" },
  
  // Tickets
  ticketNumber: { th: "เลขที่", en: "Ticket #" },
  date: { th: "วันที่", en: "Date" },
  title: { th: "หัวข้อ", en: "Title" },
  category: { th: "หมวดหมู่", en: "Category" },
  status: { th: "สถานะ", en: "Status" },
  priority: { th: "ความสำคัญ", en: "Priority" },
  all: { th: "ทั้งหมด", en: "All" },
  filterByStatus: { th: "กรองตามสถานะ", en: "Filter by Status" },
  description: { th: "รายละเอียด", en: "Description" },
  
  // Documents
  rules: { th: "กฎระเบียบหมู่บ้านฯ", en: "Rules & Regulations" },
  commonFee: { th: "อัตราค่าส่วนกลาง", en: "Common Area Fees" },
  account: { th: "บัญชีรายรับ-รายจ่าย", en: "Financial Report" },
  meeting: { th: "รายงานการประชุม", en: "Meeting Minutes" },
  other: { th: "อื่นๆ", en: "Other" },
  download: { th: "ดาวน์โหลด", en: "Download" },
  fileSize: { th: "ขนาดไฟล์", en: "File Size" },
  
  // Categories
  leak: { th: "น้ำรั่ว", en: "Leakage" },
  electrical: { th: "ไฟฟ้า", en: "Electrical" },
  plumbing: { th: "ประปา", en: "Plumbing" },
  noise: { th: "เสียงรบกวน", en: "Noise" },
  commonArea: { th: "พื้นที่ส่วนกลาง", en: "Common Area" },
  parkingCategory: { th: "ที่จอดรถ", en: "Parking" },
  otherCategory: { th: "อื่นๆ", en: "Other" },
};

export function t(key: string, lang: Lang = "th"): string {
  const entry = (translations as any)[key];
  if (!entry) return key;
  return entry[lang] || entry.th || key;
}

export default translations;
