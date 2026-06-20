-- Create chat_session table for task state machine support
CREATE TABLE IF NOT EXISTS chat_session (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL UNIQUE,
    task_state VARCHAR(50) NOT NULL DEFAULT 'PLANNING',
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP,
    title VARCHAR(500)
);

-- Create app_user table for user profiles
CREATE TABLE IF NOT EXISTS app_user (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

-- Create developer_profile table for long-term memory (user profiles)
CREATE TABLE IF NOT EXISTS developer_profile (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    profile_name VARCHAR(255) NOT NULL UNIQUE,
    prompt_template TEXT,
    language VARCHAR(50) DEFAULT 'ru',
    communication_style VARCHAR(50) DEFAULT 'detailed',
    description VARCHAR(500),
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

-- Create sticky_fact table for working memory
CREATE TABLE IF NOT EXISTS sticky_fact (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    fact_key VARCHAR(255) NOT NULL,
    fact_value TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    is_auto_extracted BOOLEAN DEFAULT FALSE,
    CONSTRAINT unique_session_fact UNIQUE (session_id, fact_key)
);

-- Create chat_message table for conversation history
CREATE TABLE IF NOT EXISTS chat_message (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    model VARCHAR(255),
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    response_time_ms INTEGER,
    provider VARCHAR(50),
    temperature DOUBLE,
    max_tokens INTEGER,
    summary TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create task_context table for state machine context transfer
CREATE TABLE IF NOT EXISTS task_context (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL UNIQUE,
    planning_context TEXT,
    execution_context TEXT,
    validation_context TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

-- Create architectural_decision table
CREATE TABLE IF NOT EXISTS architectural_decision (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    rationale TEXT,
    user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES app_user(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_session_id ON chat_session(session_id);
CREATE INDEX IF NOT EXISTS idx_task_state ON chat_session(task_state);
CREATE INDEX IF NOT EXISTS idx_created_at ON chat_session(created_at);
CREATE INDEX IF NOT EXISTS idx_message_session ON chat_message(session_id);
CREATE INDEX IF NOT EXISTS idx_message_created ON chat_message(created_at);

-- Insert default developer profiles
INSERT INTO developer_profile (profile_name, prompt_template, language, communication_style, description, is_active) 
VALUES 
('Default', '', 'ru', 'none', 'Empty profile with no special instructions', TRUE);

INSERT INTO developer_profile (profile_name, prompt_template, language, communication_style, description, is_active) 
VALUES 
('Junior Developer', 'Я начинающий разработчик. Мне нужны подробные объяснения, шаг за шагом. Приводи примеры кода. Разбирай каждую концепцию детально. Отвечай на русском языке.', 'ru', 'detailed', 'Junior developer profile - needs detailed explanations', FALSE);

INSERT INTO developer_profile (profile_name, prompt_template, language, communication_style, description, is_active) 
VALUES 
('Senior Developer', 'Я опытный разработчик. Мне нужны краткие ответы по существу. Фокусируйся на ключевых моментах. Избегай излишних деталей. Отвечай на русском языке.', 'ru', 'concise', 'Senior developer profile - prefers concise answers', FALSE);
