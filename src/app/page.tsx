"use client";

import { apiFetch } from '@/lib/api-fetch';
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CheckCircle2, Eye, EyeOff, ShieldCheck, Users } from "lucide-react";
import { clearUserCache } from "@/lib/auth-helper";

interface DemoUser {
  username: string;
  real_name: string;
  role: string;
  level?: string;
}

const DEMO_USERS: DemoUser[] = [
  { username: "teacher_wang", real_name: "王老师", role: "teacher" },
  { username: "teacher_li", real_name: "李老师", role: "teacher" },
  { username: "stu_zhang", real_name: "张同学", role: "student", level: "学霸层" },
  { username: "stu_li", real_name: "李同学", role: "student", level: "学霸层" },
  { username: "stu_wang", real_name: "王同学", role: "student", level: "学霸层" },
  { username: "stu_zhao", real_name: "赵同学", role: "student", level: "学霸层" },
  { username: "stu_chen", real_name: "陈同学", role: "student", level: "勤奋中等层" },
  { username: "stu_liu", real_name: "刘同学", role: "student", level: "勤奋中等层" },
  { username: "stu_zhou", real_name: "周同学", role: "student", level: "勤奋中等层" },
  { username: "stu_wu", real_name: "吴同学", role: "student", level: "提升层" },
  { username: "stu_sun", real_name: "孙同学", role: "student", level: "提升层" },
  { username: "stu_ma", real_name: "马同学", role: "student", level: "提升层" },
];

const levelColors: Record<string, string> = {
  "全优层": "bg-yellow-100 text-yellow-700",
  "学霸层": "bg-blue-100 text-blue-700",
  "勤奋中等层": "bg-amber-100 text-amber-700",
  "提升层": "bg-red-100 text-red-700",
};

function generateCaptcha(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<"student" | "teacher" | "admin">("student");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DemoUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const code = generateCaptcha();
    setCaptchaCode(code);
    setCaptchaInput(code);
    const firstStudent = DEMO_USERS[2];
    setUsername(firstStudent.username);
    setPassword(firstStudent.username);
  }, []);

  const handleLogin = async () => {
    setError("");
    if (!username.trim() || !password.trim()) {
      setError("请输入账号和密码");
      return;
    }
    if (captchaInput !== captchaCode) {
      setError("验证码错误");
      setCaptchaCode(generateCaptcha());
      setCaptchaInput("");
      return;
    }

    setLoading(true);
    try {
      const loginResp = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });
      const loginData = await loginResp.json();

      if (!loginResp.ok || !loginData.success) {
        setError(loginData.error || "登录失败");
        setLoading(false);
        return;
      }

      const { user } = loginData;

      // 会话安全：JWT 已由服务端写入 httpOnly cookie，不再存入 localStorage。
      // 这里仅缓存低敏用户元数据供前端同步展示（侧边栏/守卫等）。
      localStorage.setItem(
        "tracinglight_user",
        JSON.stringify({
          id: user.id,
          username: user.username,
          real_name: user.real_name || "",
          role: user.role || "student",
          student_level: user.student_level || null,
          class_id: user.class_id || null,
        })
      );

      const role = user.role;
      if (!role) {
        setError("用户信息不完整，请联系管理员");
        setLoading(false);
        return;
      }

      const rolePath: Record<string, string> = { teacher: "/teacher", student: "/student", admin: "/admin" };
      window.location.href = rolePath[role] || "/student";
    } catch {
      setError("登录失败，请检查网络连接");
      setLoading(false);
    }
  };

  const handleSelectUser = (user: DemoUser) => {
    setUsername(user.username);
    setPassword(user.username);
    setSelectedUser(user);
    setCaptchaInput(captchaCode);
    setSheetOpen(false);
  };

  const filterUsers = activeTab === "teacher"
    ? DEMO_USERS.filter((u) => u.role === "teacher")
    : activeTab === "student"
      ? DEMO_USERS.filter((u) => u.role === "student")
      : [];

  return (
    <div className="app-shell min-h-screen relative flex items-center justify-center overflow-hidden px-4">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-32 w-[28rem] h-[28rem] bg-violet-300/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-44 -left-32 w-[28rem] h-[28rem] bg-fuchsia-300/25 rounded-full blur-3xl" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[36rem] h-[24rem] bg-indigo-200/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md mx-auto">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="溯光" className="w-20 h-20 mx-auto object-contain mb-4" />
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            溯光 <span className="text-brand-gradient font-extrabold">TracingLight</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">高校智慧教育 AI 平台</p>
        </div>

        {/* Login Card */}
        <Card className="border-0 glass-strong shadow-glass rounded-2xl">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-slate-800">欢迎回来</h2>
              <p className="text-sm text-slate-500 mt-1">演示账号已自动填入，直接登录即可</p>
            </div>

            {/* Role tabs */}
            <div className="flex bg-white/70 backdrop-blur-sm rounded-xl p-1 mb-5 shadow-sm border border-white/60">
              {(
                [
                  ['student', '学生端'],
                  ['teacher', '教师端'],
                  ['admin', '管理端'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => {
                    if (key === 'student') {
                      setActiveTab('student');
                      setSelectedUser(DEMO_USERS[2]);
                      setUsername(DEMO_USERS[2].username);
                      setPassword(DEMO_USERS[2].username);
                    } else if (key === 'teacher') {
                      setActiveTab('teacher');
                      setSelectedUser(DEMO_USERS[0]);
                      setUsername(DEMO_USERS[0].username);
                      setPassword(DEMO_USERS[0].username);
                    } else {
                      setActiveTab('admin');
                      setSelectedUser(null);
                      setUsername('admin');
                      setPassword('123456');
                    }
                  }}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                    activeTab === key
                      ? 'bg-white text-violet-700 shadow-soft'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Form fields */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="username" className="text-sm font-medium text-slate-600">
                  账号
                </Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setSelectedUser(null);
                  }}
                  className="mt-1.5 h-11 bg-white/75 border-slate-200/80 focus:border-teal-400 focus:ring-teal-400"
                  placeholder="输入账号"
                />
              </div>

              <div>
                <Label htmlFor="password" className="text-sm font-medium text-slate-600">
                  密码
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setSelectedUser(null);
                    }}
                    className="h-11 bg-white/75 border-slate-200/80 focus:border-teal-400 focus:ring-teal-400 pr-10"
                    placeholder="输入密码"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Captcha */}
              <div>
                <Label htmlFor="captcha" className="text-sm font-medium text-slate-600">
                  验证码
                </Label>
                <div className="flex gap-3 mt-1.5">
                  <Input
                    id="captcha"
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value.toUpperCase())}
                    className="h-11 bg-white/75 border-slate-200/80 focus:border-teal-400 focus:ring-teal-400 flex-1"
                    placeholder="输入验证码"
                    maxLength={4}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const c = generateCaptcha();
                      setCaptchaCode(c);
                      setCaptchaInput(c);
                    }}
                    className="h-11 px-4 brand-gradient rounded-lg text-white font-mono text-lg font-bold tracking-widest select-none hover:opacity-95 transition-opacity min-w-[80px]"
                    style={{
                      letterSpacing: "0.3em",
                    }}
                  >
                    {captchaCode}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  <ShieldCheck className="w-4 h-4" />
                  {error}
                </div>
              )}

              <Button
                onClick={handleLogin}
                disabled={loading}
                className="w-full h-11 brand-gradient hover:opacity-95 text-white font-semibold shadow-soft transition-all duration-200 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />{" "}
                    登录中...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> 登录
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Hint */}
        <p className="text-center text-xs text-slate-400 mt-4">默认账号密码均为用户名</p>
      </div>

      {/* Floating user switch button */}
      <div className={activeTab === "admin" ? "hidden" : "fixed left-6 bottom-6 z-50"}>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button className="flex items-center gap-2 px-4 py-3 glass-strong rounded-xl shadow-soft hover:shadow-glass transition-all text-slate-600 hover:text-slate-800">
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">切换用户</span>
              <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">
                {activeTab === "teacher" ? "2" : "10"}
              </span>
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[340px] sm:w-[380px]">
            <SheetHeader>
              <SheetTitle>切换演示用户</SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-1">
              {filterUsers.map((user) => (
                <button
                  key={user.username}
                  onClick={() => handleSelectUser(user)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
                    selectedUser?.username === user.username
                      ? "bg-violet-50 border border-violet-200"
                      : "hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-sm font-medium shrink-0">
                    {user.real_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate">
                      {user.real_name}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{user.username}</div>
                  </div>
                  {user.level && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${levelColors[user.level] || "bg-slate-100 text-slate-600"}`}
                    >
                      {user.level}
                    </span>
                  )}
                  {selectedUser?.username === user.username && (
                    <CheckCircle2 className="w-4 h-4 text-violet-500 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
