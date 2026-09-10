-- ============================================================
-- 本机原生 PostgreSQL 18 一次性初始化脚本
-- 为溯光应用创建专属账号 tracinglight 与数据库 tracinglight
--
-- 用法（任选其一，均需以超级管理员 postgres 运行）：
--   A. psql:
--        "F:\Program Files\PostgreSQL\18\bin\psql.exe" ^
--            -h 127.0.0.1 -p 5432 -U postgres -f setup-local-pg.sql
--   B. pgAdmin 4：打开 Query Tool → 粘贴本文件全部内容 → 运行
--      （注意：脚本本应连接 postgres 管理库所在会话执行）
-- ============================================================

-- 1) 创建应用账号（若不存在）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tracinglight') THEN
    CREATE ROLE tracinglight LOGIN PASSWORD 'tracinglight_pw';
  END IF;
END $$;

-- 2) 创建应用数据库并归属该账号（若不存在）
SELECT 'CREATE DATABASE tracinglight OWNER tracinglight'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'tracinglight')\gexec

-- 3) 确保账号对该库拥有全部权限（已有库时兜底授权）
\connect tracinglight
GRANT ALL ON SCHEMA public TO tracinglight;
ALTER DATABASE tracinglight OWNER TO tracinglight;

\echo '=================================================='
\echo ' 完成! 应用连接串: postgres://tracinglight:tracinglight_pw@localhost:5432/tracinglight'
\echo '=================================================='