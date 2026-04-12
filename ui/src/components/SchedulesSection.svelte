<script lang="ts">
    import { onMount } from "svelte";
    import { api } from "../lib/api";
    import { schedules, categories, isAuthenticated, popup } from "../lib/store";

    type ScheduleDraft = {
        hour: string;
        minute: string;
        scheduleType: string;
        frequency: string;
        dayOfWeek: string;
        dayOfMonth: string;
        timezone: string;
        categoryIds: string[];
        overrideToEmail: string;
    };

    let createDraft = emptyDraft();
    let editingId: number | null = null;
    let editDraft = emptyDraft();

    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
    const minutes = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, "0"));
    const timezones = Intl.supportedValuesOf("timeZone");
    const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

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
        };
    }

    async function loadSchedules() {
        try {
            const data = await api("/schedules");
            if (data) schedules.set(data);
        } catch (e) {
            console.error(e);
        }
    }

    function toPayload(draft: ScheduleDraft) {
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
            override_to_email: draft.overrideToEmail.trim() || null,
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
                message: "Please select time, timezone, and type.",
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

    function startEdit(schedule: any) {
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

    function draftFromSchedule(schedule: any): ScheduleDraft {
        const date = schedule.time ? new Date(schedule.time) : null;
        const parts = (schedule.cron_expression || "").split(" ");
        const frequency = inferFrequency(parts);
        const timezone = timezones.includes(schedule.timezone) ? schedule.timezone : "UTC";
        const zonedDateParts = date ? getDatePartsInTimezone(date, timezone) : null;

        return {
            hour: zonedDateParts?.hour || parts[2]?.padStart(2, "0") || "",
            minute: zonedDateParts?.minute || parts[1]?.padStart(2, "0") || "",
            scheduleType: schedule.schedule_type || "rss",
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
            categoryIds: (schedule.category_ids || []).map((id: number) => String(id)),
            overrideToEmail: schedule.override_to_email || "",
        };
    }

    function inferFrequency(parts: string[]) {
        if (parts[3] !== "*" && parts[5] === "*") return "monthly";
        if (parts[3] === "*" && parts[5] !== "*") return "weekly";
        return "daily";
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

    function formatCron(schedule: any) {
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
        if (!categoryIds?.length) return ["Alle Kategorien"];
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
                        <div class="form-grid">
                            <div class="input-group frequency-group">
                                <select bind:value={editDraft.frequency} class="modern-select" aria-label="Frequency">
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                </select>
                                {#if editDraft.frequency === "weekly"}
                                    <select bind:value={editDraft.dayOfWeek} class="modern-select" aria-label="Day of Week">
                                        {#each daysOfWeek as d}
                                            <option value={d.val}>{d.label}</option>
                                        {/each}
                                    </select>
                                {/if}
                                {#if editDraft.frequency === "monthly"}
                                    <select bind:value={editDraft.dayOfMonth} class="modern-select" aria-label="Day of Month">
                                        {#each daysOfMonth as d}
                                            <option value={d}>{d}</option>
                                        {/each}
                                    </select>
                                {/if}
                            </div>

                            <div class="input-group time-group">
                                <select bind:value={editDraft.hour} required class="modern-select time-select">
                                    <option value="" disabled>HH</option>
                                    {#each hours as h}
                                        <option value={h}>{h}</option>
                                    {/each}
                                </select>
                                <span class="time-separator">:</span>
                                <select bind:value={editDraft.minute} required class="modern-select time-select">
                                    <option value="" disabled>MM</option>
                                    {#each minutes as m}
                                        <option value={m}>{m}</option>
                                    {/each}
                                </select>
                            </div>

                            <select bind:value={editDraft.timezone} class="modern-select timezone-select">
                                {#each timezones as tz}
                                    <option value={tz}>{tz}</option>
                                {/each}
                            </select>

                            <select bind:value={editDraft.scheduleType} class="modern-select type-select">
                                <option value="rss">RSS Generator</option>
                                <option value="read_it_later">Read It Later</option>
                            </select>

                            <input
                                bind:value={editDraft.overrideToEmail}
                                type="email"
                                class="modern-select"
                                placeholder="Empfaenger-Email (optional)"
                            />
                        </div>

                        {#if editDraft.scheduleType === "rss"}
                            <div class="category-picker">
                                <div class="category-picker-label">Kategorien</div>
                                <div class="category-options">
                                    {#each $categories as cat (cat.id)}
                                        <label class="category-option">
                                            <input type="checkbox" bind:group={editDraft.categoryIds} value={String(cat.id)} />
                                            <span>{cat.name}</span>
                                        </label>
                                    {/each}
                                </div>
                                {#if editDraft.categoryIds.length === 0}
                                    <div class="selection-hint">Keine Auswahl bedeutet: Alle Kategorien</div>
                                {/if}
                            </div>
                        {/if}

                        <div class="edit-actions">
                            <button type="button" class="add-btn-modern" on:click={() => saveEdit(schedule.id)}>Speichern</button>
                            <button type="button" class="secondary-btn" on:click={cancelEdit}>Abbrechen</button>
                        </div>
                    </div>
                {:else}
                    <div class="schedule-info">
                        <span class="schedule-time">{formatCron(schedule)}</span>
                        <span class="schedule-type-badge">{schedule.schedule_type || "rss"}</span>
                        {#if (schedule.schedule_type || "rss") === "rss"}
                            {#each categoryNames(schedule.category_ids || []) as categoryName}
                                <span class="schedule-category-badge">{categoryName}</span>
                            {/each}
                        {/if}
                        {#if schedule.override_to_email}
                            <span class="schedule-email-badge">{schedule.override_to_email}</span>
                        {/if}
                    </div>
                    <div class="schedule-actions">
                        <button on:click={() => startEdit(schedule)} class="secondary-btn">Bearbeiten</button>
                        <button on:click={() => deleteSchedule(schedule.id)} class="delete-btn">×</button>
                    </div>
                {/if}
            </li>
        {/each}
    </ul>

    <form on:submit|preventDefault={addSchedule} id="add-schedule-form" class="modern-form">
        <div class="form-grid">
            <div class="input-group frequency-group">
                <select bind:value={createDraft.frequency} class="modern-select" aria-label="Frequency">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                </select>
                {#if createDraft.frequency === "weekly"}
                    <select bind:value={createDraft.dayOfWeek} class="modern-select" aria-label="Day of Week">
                        {#each daysOfWeek as d}
                            <option value={d.val}>{d.label}</option>
                        {/each}
                    </select>
                {/if}
                {#if createDraft.frequency === "monthly"}
                    <select bind:value={createDraft.dayOfMonth} class="modern-select" aria-label="Day of Month">
                        {#each daysOfMonth as d}
                            <option value={d}>{d}</option>
                        {/each}
                    </select>
                {/if}
            </div>

            <div class="input-group time-group">
                <select bind:value={createDraft.hour} required class="modern-select time-select">
                    <option value="" disabled>HH</option>
                    {#each hours as h}
                        <option value={h}>{h}</option>
                    {/each}
                </select>
                <span class="time-separator">:</span>
                <select bind:value={createDraft.minute} required class="modern-select time-select">
                    <option value="" disabled>MM</option>
                    {#each minutes as m}
                        <option value={m}>{m}</option>
                    {/each}
                </select>
            </div>

            <select bind:value={createDraft.timezone} id="timezone-select" required class="modern-select timezone-select">
                {#each timezones as tz}
                    <option value={tz}>{tz}</option>
                {/each}
            </select>

            <select bind:value={createDraft.scheduleType} required class="modern-select type-select">
                <option value="rss">RSS Generator</option>
                <option value="read_it_later">Read It Later</option>
            </select>

            <input
                bind:value={createDraft.overrideToEmail}
                type="email"
                class="modern-select"
                placeholder="Empfaenger-Email (optional)"
            />

            <button type="submit" class="add-btn-modern">Add Schedule</button>
        </div>

        {#if createDraft.scheduleType === "rss"}
            <div class="category-picker">
                <div class="category-picker-label">Kategorien</div>
                <div class="category-options">
                    {#each $categories as cat (cat.id)}
                        <label class="category-option">
                            <input type="checkbox" bind:group={createDraft.categoryIds} value={String(cat.id)} />
                            <span>{cat.name}</span>
                        </label>
                    {/each}
                </div>
                {#if createDraft.categoryIds.length === 0}
                    <div class="selection-hint">Keine Auswahl bedeutet: Alle Kategorien</div>
                {/if}
            </div>
        {/if}
    </form>
</section>

<style>
    .schedule-item {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: flex-start;
    }

    .schedule-info,
    .schedule-actions,
    .edit-actions,
    .schedule-edit {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex-wrap: wrap;
    }

    .schedule-edit {
        width: 100%;
        flex-direction: column;
        align-items: stretch;
    }

    .schedule-category-badge,
    .schedule-email-badge {
        font-size: 0.8rem;
        color: #fff;
        padding: 2px 6px;
        border-radius: 4px;
    }

    .schedule-category-badge {
        background: #607d8b;
    }

    .schedule-email-badge {
        background: #7b5cff;
    }

    .category-picker {
        display: grid;
        gap: 0.5rem;
    }

    .category-picker-label {
        font-size: 0.9rem;
        font-weight: 600;
    }

    .category-options {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .category-option {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.35rem 0.6rem;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 999px;
    }

    .selection-hint {
        font-size: 0.85rem;
        opacity: 0.8;
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
        }

        .schedule-actions {
            width: 100%;
            justify-content: flex-end;
        }
    }
</style>
