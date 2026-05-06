// =========================
// DOM UTILITIES (CORE)
// Central place for safe DOM access and helpers
// =========================

export function safeGet<T extends HTMLElement = HTMLElement>(
    id: string
): T | null {
    return document.getElementById(id) as T | null;
}

export function qs<T extends Element = Element>(
    selector: string
): T | null {
    return document.querySelector(selector) as T | null;
}

export function qsa<T extends Element = Element>(
    selector: string
): T[] {
    return Array.from(document.querySelectorAll(selector)) as T[];
}

export function setText(id: string, value: string): void {
    const el = safeGet(id);

    if (el) {
        el.textContent = value;
    }
}

export function setValue(id: string, value: any): void {
    const el = safeGet<HTMLInputElement>(id);

    if (!el) return;

    el.value = value ?? '';

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function show(el: HTMLElement | null): void {
    if (el) {
        el.classList.remove('hidden');
    }
}

export function hide(el: HTMLElement | null): void {
    if (el) {
        el.classList.add('hidden');
    }
}

// =========================
// TEMP GLOBAL BRIDGE
// Allows legacy JS modules to continue working
// during migration to TypeScript modules.
// =========================
(window as any).safeGet = (window as any).safeGet || safeGet;