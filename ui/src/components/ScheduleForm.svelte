<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { Category, ScheduleDraft } from "../lib/types";

    export let draft: ScheduleDraft;
    export let categories: Category[] = [];
    export let hours: string[] = [];
    export let minutes: string[] = [];
    export let timezones: string[] = [];
    export let daysOfWeek: Array<{ val: string; label: string }> = [];
    export let daysOfMonth: string[] = [];
    export let submitLabel = "Save";
    export let showCancel = false;
    export let fetchWindowId = "schedule-fetch-window";

    const dispatch = createEventDispatcher<{ submit: void; cancel: void }>();

    function handleSubmit() {
        dispatch("submit");
    }

    function handleCancel() {
        dispatch("cancel");
    }

    let timezoneOptions: string[] = [];

    $: timezoneOptions =
        draft.timezone && !timezones.includes(draft.timezone)
            ? [draft.timezone, ...timezones]
            : timezones;
</script>

<form on:submit|preventDefault={handleSubmit} class="schedule-form">
    <div class="form-grid schedule-form-grid">
        <div class="input-group frequency-group">
            <select bind:value={draft.frequency} class="modern-select" aria-label="Frequency">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
            </select>
            {#if draft.frequency === "weekly"}
                <select bind:value={draft.dayOfWeek} class="modern-select" aria-label="Day of Week">
                    {#each daysOfWeek as d}
                        <option value={d.val}>{d.label}</option>
                    {/each}
                </select>
            {/if}
            {#if draft.frequency === "monthly"}
                <select bind:value={draft.dayOfMonth} class="modern-select" aria-label="Day of Month">
                    {#each daysOfMonth as d}
                        <option value={d}>{d}</option>
                    {/each}
                </select>
            {/if}
        </div>

        <div class="input-group time-group">
            <select bind:value={draft.hour} required class="modern-select time-select">
                <option value="" disabled>HH</option>
                {#each hours as h}
                    <option value={h}>{h}</option>
                {/each}
            </select>
            <span class="time-separator">:</span>
            <select bind:value={draft.minute} required class="modern-select time-select">
                <option value="" disabled>MM</option>
                {#each minutes as m}
                    <option value={m}>{m}</option>
                {/each}
            </select>
        </div>

        <select bind:value={draft.timezone} class="modern-select timezone-select" aria-label="Timezone">
            {#each timezoneOptions as tz}
                <option value={tz}>{tz}</option>
            {/each}
        </select>

        <select bind:value={draft.scheduleType} class="modern-select type-select" aria-label="Schedule Type">
            <option value="rss">RSS Generator</option>
            <option value="read_it_later">Read It Later</option>
        </select>

        <input
            bind:value={draft.overrideToEmail}
            type="email"
            multiple
            class="modern-select email-input"
            placeholder="Recipient email(s) [optional]"
        />
    </div>

    <div class="selection-hint">Multiple recipients can be separated with commas.</div>

    {#if draft.scheduleType === "rss"}
        <div class="schedule-details-grid">
            <div class="category-picker">
                <div class="category-picker-label">Categories</div>
                <div class="category-options">
                    {#each categories as cat (cat.id)}
                        <label class="category-option">
                            <input type="checkbox" bind:group={draft.categoryIds} value={String(cat.id)} />
                            <span>{cat.name}</span>
                        </label>
                    {/each}
                </div>
                {#if draft.categoryIds.length === 0}
                    <div class="selection-hint">No selection means all categories.</div>
                {/if}
            </div>

            <div class="field-stack compact-field">
                <label for={fetchWindowId}>Fetch Window Override</label>
                <input
                    id={fetchWindowId}
                    bind:value={draft.fetchSinceHoursOverride}
                    type="number"
                    min="1"
                    step="1"
                    class="modern-select"
                    placeholder="Hours [optional]"
                />
            </div>
        </div>
    {/if}

    <div class="form-actions" class:with-cancel={showCancel}>
        <button type="submit" class="add-btn-modern">{submitLabel}</button>
        {#if showCancel}
            <button type="button" class="secondary-btn" on:click={handleCancel}>Cancel</button>
        {/if}
    </div>
</form>

<style>
    .schedule-form {
        display: grid;
        gap: 1rem;
    }

    .schedule-form-grid {
        align-items: end;
        gap: 0.85rem;
    }

    .email-input {
        grid-column: span 2;
    }

    .schedule-details-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(180px, 220px);
        gap: 1rem;
        align-items: start;
    }

    .field-stack {
        display: grid;
        gap: 0.4rem;
    }

    .field-stack label {
        font-size: 0.85rem;
        font-weight: 600;
        opacity: 0.9;
    }

    .compact-field {
        align-content: start;
    }

    .category-picker {
        display: grid;
        gap: 0.45rem;
    }

    .category-picker-label {
        font-size: 0.85rem;
        font-weight: 600;
        opacity: 0.95;
    }

    .category-options {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
    }

    .category-option {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.28rem 0.55rem;
        font-size: 0.92rem;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 999px;
    }

    .category-option input {
        width: 0.8rem;
        height: 0.8rem;
        margin: 0;
    }

    .selection-hint {
        font-size: 0.8rem;
        opacity: 0.72;
        line-height: 1.35;
    }

    .form-actions {
        display: flex;
        justify-content: flex-start;
        margin-top: 0.25rem;
    }

    .form-actions.with-cancel {
        gap: 0.75rem;
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
        .email-input {
            grid-column: 1 / -1;
        }

        .schedule-details-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
