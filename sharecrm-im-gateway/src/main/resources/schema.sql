-- ShareCRM IM Gateway 数据库 Schema
-- H2 PostgreSQL 兼容模式

-- 账号表
CREATE TABLE IF NOT EXISTS accounts (
    id BIGSERIAL PRIMARY KEY,
    app_id VARCHAR(50) NOT NULL UNIQUE,
    app_secret VARCHAR(100) NOT NULL,
    bot_name VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_accounts_app_id ON accounts(app_id);
