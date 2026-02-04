-- Add description and picture fields to users table
-- Migration: 0012_add_user_description_and_picture.sql

ALTER TABLE users ADD COLUMN description TEXT;
ALTER TABLE users ADD COLUMN picture TEXT;
