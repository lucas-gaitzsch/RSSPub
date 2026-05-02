export type ScheduleType = "rss" | "read_it_later";

export type ScheduleFrequency = "daily" | "weekly" | "monthly";

export type Category = {
    id: number;
    name: string;
};

export type EmailConfig = {
    smtp_host: string;
    smtp_port: number;
    smtp_password: string;
    smtp_username: string;
    email_address: string;
    to_email: string;
    enable_auto_send: boolean;
};

export type Schedule = {
    id: number;
    time: string;
    active: boolean;
    schedule_type: ScheduleType | string;
    cron_expression: string;
    timezone: string;
    category_ids: number[];
    override_to_email: string | null;
    fetch_since_hours_override: number | null;
};

export type ScheduleDraft = {
    hour: string;
    minute: string;
    scheduleType: ScheduleType;
    frequency: ScheduleFrequency;
    dayOfWeek: string;
    dayOfMonth: string;
    timezone: string;
    categoryIds: string[];
    overrideToEmail: string;
    fetchSinceHoursOverride: number | "";
};
