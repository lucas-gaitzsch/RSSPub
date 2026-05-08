<script lang="ts">
    import { onMount } from "svelte";
    import { api } from "../lib/api";
    import { schedules, categories, isAuthenticated, popup } from "../lib/store";
    import type { Schedule, ScheduleDraft, ScheduleFrequency, ScheduleType } from "../lib/types";
    import ScheduleForm from "./ScheduleForm.svelte";

    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
    const minutes = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, "0"));
    const timezones = Intl.supportedValuesOf("timeZone");
    const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    let createDraft = emptyDraft();
    let editingId: number | null = null;
    let editDraft = emptyDraft();

    const daysOfWeek = [
        { val: "0", label: "Monday" },
        { val: "1", label: "Tuesday" },
        { val: "2", label: "Wednesday" },
        { val: "3", label: "Thursday" },
        { val: "4", label: "Friday" },
        { val: "5", label: "Saturday" },
        { val: "6", label: "Sunday" },
    ];

    const daysOfMonth = Array.from({ length: 31 }, (_, i) => (i + 1).toString());

    onMount(() => {
        if ($isAuthenticated) {
            loadSchedules();
        }
    });

    $: if ($isAuthenticated) {
        loadSchedules();
    }

    function emptyDraft(): ScheduleDraft {
        return {
            hour: "",
            minute: "",
            scheduleType: "rss",
            frequency: "daily",
            dayOfWeek: "0",
            dayOfMonth: "1",
            timezone: timezones.includes(localTimezone) ? localTimezone : "UTC",
            categoryIds: [],
            overrideToEmail: "",
            fetchSinceHoursOverride: "",
        };
    }

    async function loadSchedules() {
        try {
            const data = await api("/schedules") as Schedule[] | null;
            if (data) schedules.set(data);
        } catch (e) {
            console.error(e);
        }
    }

    function normalizeOptionalText(value: string | number | null | undefined): string {
        if (value == null) return "";
        return String(value).trim();
    }

    function normalizeRecipientList(value: string): string {
        return value
            .split(",")
            .map((e) => e.trim())
            .filter((e) => e)
            .join(", ");
    }

    function normalizeScheduleType(value: string): ScheduleType {
        return value === "read_it_later" ? "read_it_later" : "rss";
    }

    function inferDraftFrequency(parts: string[]): ScheduleFrequency {
        if (parts[3] !== "*" && parts[5] === "*") return "monthly";
        if (parts[3] === "*" && parts[5] !== "*") return "weekly";
        return "daily";
    }

    function toPayload(draft: ScheduleDraft) {
        const trimmedFetchSinceHoursOverride = normalizeOptionalText(draft.fetchSinceHoursOverride);
        const payload: any = {
            hour: parseInt(draft.hour, 10),
            minute: parseInt(draft.minute, 10),
            timezone: draft.timezone,
            schedule_type: draft.scheduleType,
            frequency: draft.frequency,
            category_ids:
                draft.scheduleType === "rss"
                    ? draft.categoryIds.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id))
                    : [],
            override_to_email: normalizeRecipientList(draft.overrideToEmail) || null,
            fetch_since_hours_override:
                draft.scheduleType === "rss" && trimmedFetchSinceHoursOverride
                    ? parseInt(trimmedFetchSinceHoursOverride, 10)
                    : null,
        };

        if (draft.frequency === "weekly") {
            payload.day_of_week = parseInt(draft.dayOfWeek, 10);
        } else if (draft.frequency === "monthly") {
            payload.day_of_month = parseInt(draft.dayOfMonth, 10);
        }

        return payload;
    }

    function validateDraft(draft: ScheduleDraft) {
        if (!draft.hour || !draft.minute || !draft.timezone || !draft.scheduleType) {
            popup.set({
                visible: true,
                title: "Missing Information",
                message: "Please select a time, timezone, and schedule type.",
                isError: true,
            });
            return false;
        }

        const trimmedFetchSinceHoursOverride = normalizeOptionalText(draft.fetchSinceHoursOverride);
        if (draft.scheduleType === "rss" && trimmedFetchSinceHoursOverride) {
            const value = Number(trimmedFetchSinceHoursOverride);
            if (!Number.isInteger(value) || value <= 0) {
                popup.set({
                    visible: true,
                    title: "Invalid Fetch Window",
                    message: "Fetch window override must be a positive whole number.",
                    isError: true,
                });
                return false;
            }
        }

        if (!draft.timezone) {
            popup.set({
                visible: true,
                title: "Invalid Timezone",
                message: "Please select a valid timezone.",
                isError: true,
            });
            return false;
        }

        return true;
    }

    async function addSchedule() {
        if (!validateDraft(createDraft)) return;

        try {
            await api("/schedules", "POST", toPayload(createDraft));
            createDraft = emptyDraft();
            await loadSchedules();
        } catch (e: any) {
            popup.set({
                visible: true,
                title: "Error",
                message: e.message,
                isError: true,
            });
        }
    }

    function startEdit(schedule: Schedule) {
        editingId = schedule.id;
        editDraft = draftFromSchedule(schedule);
    }

    function cancelEdit() {
        editingId = null;
        editDraft = emptyDraft();
    }

    async function saveEdit(id: number) {
        if (!validateDraft(editDraft)) return;

        try {
            await api(`/schedules/${id}`, "PUT", toPayload(editDraft));
            cancelEdit();
            await loadSchedules();
        } catch (e: any) {
            popup.set({
                visible: true,
                title: "Error",
                message: e.message,
                isError: true,
            });
        }
    }

    function draftFromSchedule(schedule: Schedule): ScheduleDraft {
        const date = schedule.time ? new Date(schedule.time) : null;
        const parts = (schedule.cron_expression || "").split(" ");
        const frequency = inferDraftFrequency(parts);
        const timezone = schedule.timezone || "UTC";
        const zonedDateParts = date ? getDatePartsInTimezone(date, timezone) : null;

        return {
            hour: zonedDateParts?.hour || parts[2]?.padStart(2, "0") || "",
            minute: zonedDateParts?.minute || parts[1]?.padStart(2, "0") || "",
            scheduleType: normalizeScheduleType(schedule.schedule_type || "rss"),
            frequency,
            dayOfWeek:
                frequency === "weekly"
                    ? dayOfWeekFromSchedule(zonedDateParts, parts)
                    : "0",
            dayOfMonth:
                frequency === "monthly"
                    ? dayOfMonthFromSchedule(zonedDateParts, parts)
                    : "1",
            timezone,
            categoryIds: schedule.category_ids.map((id) => String(id)),
            overrideToEmail: schedule.override_to_email || "",
            fetchSinceHoursOverride: schedule.fetch_since_hours_override ?? "",
        };
    }

    function getDatePartsInTimezone(date: Date, timezone: string) {
        const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone,
            hour: "2-digit",
            minute: "2-digit",
            weekday: "short",
            day: "2-digit",
            hour12: false,
        });

        const partMap = Object.fromEntries(
            formatter
                .formatToParts(date)
                .filter((part) => part.type !== "literal")
                .map((part) => [part.type, part.value]),
        );

        return {
            hour: partMap.hour,
            minute: partMap.minute,
            weekday: partMap.weekday,
            day: partMap.day,
        };
    }

    function dayOfWeekFromSchedule(
        zonedDateParts: { weekday?: string } | null,
        parts: string[],
    ) {
        if (zonedDateParts?.weekday) {
            const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
            const weekdayIndex = weekdays.indexOf(zonedDateParts.weekday);
            if (weekdayIndex >= 0) {
                return weekdayIndex.toString();
            }
        }

        const cronDay = parseInt(parts[5] || "0", 10);
        return Number.isNaN(cronDay) ? "0" : ((cronDay + 6) % 7).toString();
    }

    function dayOfMonthFromSchedule(zonedDateParts: { day?: string } | null, parts: string[]) {
        if (zonedDateParts?.day) {
            return String(parseInt(zonedDateParts.day, 10));
        }

        return parts[3] || "1";
    }

    function deleteSchedule(id: number) {
        popup.set({
            visible: true,
            title: "Confirm Deletion",
            message: "Delete this schedule?",
            isError: false,
            type: "confirm",
            onConfirm: async () => {
                try {
                    await api(`/schedules/${id}`, "DELETE");
                    if (editingId === id) {
                        cancelEdit();
                    }
                    await loadSchedules();
                } catch (e: any) {
                    popup.set({
                        visible: true,
                        title: "Error",
                        message: e.message,
                        isError: true,
                    });
                }
            },
            onCancel: () => {},
        });
    }

    function formatCron(schedule: Schedule) {
        const cron = schedule.cron_expression;
        if (!cron) return "Unknown";

        let localTimeStr = "";
        if (schedule.time) {
            const date = new Date(schedule.time);
            localTimeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        }

        const parts = cron.split(" ");
        if (parts.length < 5) return cron;

        const min = parts[1].padStart(2, "0");
        const hour = parts[2].padStart(2, "0");
        const dom = parts[3];
        const dow = parts[5];
        const displayTime = localTimeStr || `${hour}:${min}`;

        if (dom === "*" && dow === "*") {
            return `Daily at ${displayTime}`;
        }

        if (dom === "*" && dow !== "*") {
            const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            const dayName = days[parseInt(dow, 10)] || dow;
            return `Weekly on ${dayName} at ${displayTime}`;
        }

        if (dom !== "*" && dow === "*") {
            return `Monthly on day ${dom} at ${displayTime}`;
        }

        return cron;
    }

    function categoryNames(categoryIds: number[]) {
        if (!categoryIds?.length) return ["All categories"];
        return categoryIds.map((id) => ($categories.find((c) => c.id === id) || {}).name || String(id));
    }
</script>

<section id="schedules-section" class="card">
    <div class="card-header">
        <img src="/icons/clock.svg" alt="Schedule Icon" width="20" height="20" />
        <h2>Schedules</h2>
    </div>

    <ul id="schedules-list" class="item-list">
        {#each $schedules as schedule (schedule.id)}
            <li class="schedule-item">
                {#if editingId === schedule.id}
                    <div class="schedule-edit">
                        <ScheduleForm
                            draft={editDraft}
                            categories={$categories}
                            {hours}
                            {minutes}
                            {timezones}
                            {daysOfWeek}
                            {daysOfMonth}
                            submitLabel="Save"
                            showCancel={true}
                            fetchWindowId={"edit-fetch-window-" + schedule.id}
                            on:submit={() => saveEdit(schedule.id)}
                            on:cancel={cancelEdit}
                        />
                    </div>
                {:else}
                    <div class="schedule-info">
                        <span class="schedule-time">{formatCron(schedule)}</span>
                        <div class="schedule-meta-row">
                            <span class="schedule-type-badge">{schedule.schedule_type || "rss"}</span>
                            {#if (schedule.schedule_type || "rss") === "rss"}
                                {#each categoryNames(schedule.category_ids || []) as categoryName}
                                    <span class="schedule-category-badge">{categoryName}</span>
                                {/each}
                                {#if schedule.fetch_since_hours_override != null}
                                    <span class="schedule-fetch-badge">{schedule.fetch_since_hours_override}h window</span>
                                {/if}
                            {/if}
                            {#if schedule.override_to_email}
                                <span class="schedule-email-badge">{schedule.override_to_email}</span>
                            {/if}
                        </div>
                    </div>
                    <div class="schedule-actions">
                        <button on:click={() => startEdit(schedule)} class="secondary-btn">Edit</button>
                        <button on:click={() => deleteSchedule(schedule.id)} class="delete-btn">×</button>
                    </div>
                {/if}
            </li>
        {/each}
    </ul>

    <div id="add-schedule-form" class="modern-form">
        <ScheduleForm
            draft={createDraft}
            categories={$categories}
            {hours}
            {minutes}
            {timezones}
            {daysOfWeek}
            {daysOfMonth}
            submitLabel="Add Schedule"
            fetchWindowId="create-fetch-window"
            on:submit={addSchedule}
        />
    </div>
</section>

<style>
    .schedule-item {
        display: flex;
        justify-content: space-between;
        gap: 1.25rem;
        align-items: center;
    }

    .schedule-info,
    .schedule-actions,
    .schedule-edit {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        flex-wrap: wrap;
    }

    .schedule-info {
        flex: 1;
        min-width: 0;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.6rem;
    }

    .schedule-time {
        font-size: 1.05rem;
        line-height: 1.3;
    }

    .schedule-meta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        align-items: center;
    }

    .schedule-actions {
        flex-shrink: 0;
        align-self: flex-start;
    }

    .schedule-edit {
        width: 100%;
        flex-direction: column;
        align-items: stretch;
        gap: 1rem;
    }

    .schedule-category-badge,
    .schedule-fetch-badge,
    .schedule-email-badge,
    .schedule-type-badge {
        font-size: 0.8rem;
        color: #fff;
        padding: 0.28rem 0.6rem;
        border-radius: 999px;
        line-height: 1;
    }

    .schedule-category-badge {
        background: #607d8b;
    }

    .schedule-type-badge {
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.8);
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }

    .schedule-email-badge {
        background: #7b5cff;
    }

    .schedule-fetch-badge {
        background: #2f855a;
    }

    .secondary-btn {
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: transparent;
        color: inherit;
        border-radius: 8px;
        padding: 0.45rem 0.75rem;
        cursor: pointer;
    }

    @media (max-width: 700px) {
        .schedule-item {
            flex-direction: column;
            align-items: stretch;
        }

        .schedule-actions {
            width: 100%;
            justify-content: flex-end;
            align-self: auto;
        }
    }
</style>
