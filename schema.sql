-- ============================================================
-- DevLink NGO Management Platform - Database Schema
-- Run this in phpMyAdmin or MySQL CLI
-- ============================================================

CREATE DATABASE IF NOT EXISTS devlink_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE devlink_db;

-- ------------------------------------------------------------
-- 1. USERS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(120)  NOT NULL,
    email         VARCHAR(180)  NOT NULL UNIQUE,
    password_hash VARCHAR(255)  NOT NULL,
    role          ENUM('Admin','Manager','FieldOfficer','Viewer') NOT NULL DEFAULT 'Viewer',
    is_active     TINYINT(1)    NOT NULL DEFAULT 1,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 2. PROJECTS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    title                VARCHAR(200)  NOT NULL,
    description          TEXT,
    start_date           DATE,
    end_date             DATE,
    target_beneficiaries INT           NOT NULL DEFAULT 0,
    target_activities    INT           NOT NULL DEFAULT 0,
    created_by           INT,
    created_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- 3. BENEFICIARIES TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beneficiaries (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    unique_id           VARCHAR(30)   NOT NULL UNIQUE,   -- e.g. DEV-2026-0001
    full_name           VARCHAR(150)  NOT NULL,
    phone               VARCHAR(25),
    location            VARCHAR(200),
    gender              ENUM('Male','Female','Other') DEFAULT 'Other',
    age                 INT,
    registered_by       INT,
    project_id          INT,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (registered_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id)    REFERENCES projects(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- 4. ACTIVITY LOGS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    project_id       INT          NOT NULL,
    activity_name    VARCHAR(200) NOT NULL,
    activity_type    ENUM('Training','Meeting','Distribution','Survey','Other') NOT NULL DEFAULT 'Other',
    activity_date    DATE         NOT NULL,
    location         VARCHAR(200),
    field_officer_id INT,
    total_attendees  INT          NOT NULL DEFAULT 0,
    notes            TEXT,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id)       REFERENCES projects(id)  ON DELETE CASCADE,
    FOREIGN KEY (field_officer_id) REFERENCES users(id)     ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- 5. ATTENDANCE TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    activity_id    INT NOT NULL,
    beneficiary_id INT NOT NULL,
    status         ENUM('Present','Absent') NOT NULL DEFAULT 'Present',
    recorded_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (activity_id)    REFERENCES activity_logs(id)  ON DELETE CASCADE,
    FOREIGN KEY (beneficiary_id) REFERENCES beneficiaries(id)  ON DELETE CASCADE,
    UNIQUE KEY uq_attendance (activity_id, beneficiary_id)
);

-- ------------------------------------------------------------
-- 6. PROJECT INDICATORS TABLE (targets vs actuals)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indicators (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    project_id     INT          NOT NULL,
    indicator_name VARCHAR(200) NOT NULL,
    target_value   DECIMAL(10,2) NOT NULL DEFAULT 0,
    actual_value   DECIMAL(10,2) NOT NULL DEFAULT 0,
    unit           VARCHAR(60),
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- SEED: Default Admin User
-- Password: Admin@123  (bcrypt hash below)
-- Change this password immediately after first login!
-- ------------------------------------------------------------
INSERT INTO users (name, email, password_hash, role) VALUES
(
    'System Admin',
    'admin@devlink.org',
    '$2b$10$8G4u3Us6rvN81t3acbHimu3l.wp5eByw3LbdYzpALBkI8EjXoFMNC',
    'Admin'
);

-- Seed: Sample Project Manager
-- Password: Manager@123
INSERT INTO users (name, email, password_hash, role) VALUES
(
    'Project Manager',
    'manager@devlink.org',
    '$2b$10$DQLtEQWhPAnmW/px2W6Iuecpr/FdPtf/PCgn4vsckjSfcoXYA9rzm',
    'Manager'
);

-- Seed: Sample Field Officer
-- Password: Field@123
INSERT INTO users (name, email, password_hash, role) VALUES
(
    'Field Officer',
    'officer@devlink.org',
    '$2b$10$/3IF5KjNWCKM6SXtox4VEO8l80c1jzBcVsUcE4CjyFbbYRiSTexHq',
    'FieldOfficer'
);
