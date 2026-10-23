ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fault text CHECK(fault IN ('before_pointer','crash_before_pointer'));
