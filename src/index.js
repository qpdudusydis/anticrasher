/**
 * AntiSpamVaccine — Revenge (Mobile Discord) Plugin
 * 디스코드 크래셔/스팸 즉시 차단
 */

// 플러그인 로드 시점에 필요한 모듈 가져오기 (번들러 없이 단일 파일로 동작)
const { findByProps } = window.revenge ? window.revenge.modules.finders : window.vendetta.metro;
const { before } = window.revenge ? window.revenge.patcher : window.vendetta.patcher;
const { showToast } = window.revenge ? window.revenge.ui.toasts : window.vendetta.ui.toasts;
const storage = window.revenge ? window.revenge.storage : window.vendetta.storage;

const DEFAULT_SETTINGS = {
    hardLimit: 2000,
    repeatLimit: 100,
    blockSpoilerAbuse: true,
    blockZalgo: true,
    blockBidi: true,
    maxNewlines: 30,
    maxZeroWidth: 15,
    toastAlert: true,
};

function getSettings() {
    if (!storage) return { ...DEFAULT_SETTINGS };
    const s = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (storage[key] !== undefined) s[key] = storage[key];
    }
    return s;
}

function initSettings() {
    if (!storage) return;
    for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
        if (storage[key] === undefined) storage[key] = val;
    }
    if (storage.repeatLimit < 20) storage.repeatLimit = 100;
    if (storage.hardLimit < 500) storage.hardLimit = 2000;
}

function detectSpam(content) {
    if (!content || typeof content !== "string") return null;
    const s = getSettings();
    const len = content.length;

    if (len > s.hardLimit) return { type: "길이초과", detail: `${len.toLocaleString()}자` };

    let maxRepeat = 0; let maxRepeatChar = ""; let repeatCount = 1;
    for (let i = 1; i < len; i++) {
        if (content[i] === content[i - 1]) {
            repeatCount++;
            if (repeatCount > maxRepeat) { maxRepeat = repeatCount; maxRepeatChar = content[i]; }
        } else { repeatCount = 1; }
    }
    if (maxRepeat >= s.repeatLimit) return { type: "반복문자", detail: `'${maxRepeatChar}' × ${maxRepeat}회` };

    if (s.blockSpoilerAbuse) {
        let spoilerCount = 0;
        for (let i = 0; i < len - 1; i++) {
            if (content[i] === "|" && content[i + 1] === "|") { spoilerCount++; i++; }
        }
        if (spoilerCount > 20) return { type: "스포일러크래셔", detail: `스포일러 ${spoilerCount}개` };
    }

    if (s.blockZalgo) {
        let combiningCount = 0;
        for (let i = 0; i < len; i++) {
            const code = content.charCodeAt(i);
            if ((code >= 0x0300 && code <= 0x036F) || (code >= 0x0489 && code <= 0x0489) || (code >= 0x1AB0 && code <= 0x1AFF) || (code >= 0x1DC0 && code <= 0x1DFF) || (code >= 0x20D0 && code <= 0x20FF) || (code >= 0xFE00 && code <= 0xFE0F) || (code >= 0xFE20 && code <= 0xFE2F)) {
                combiningCount++;
            }
        }
        if (combiningCount > 30) return { type: "잘고텍스트", detail: `결합문자 ${combiningCount}개` };
    }

    if (s.blockBidi) {
        let bidiCount = 0;
        for (let i = 0; i < len; i++) {
            const code = content.charCodeAt(i);
            if ([0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069].includes(code)) bidiCount++;
        }
        if (bidiCount > 10) return { type: "BiDi크래셔", detail: `방향 문자 ${bidiCount}개` };
    }

    let nlCount = 0;
    for (let i = 0; i < len; i++) if (content[i] === "\n") nlCount++;
    if (nlCount > s.maxNewlines) return { type: "줄바꿈도배", detail: `줄바꿈 ${nlCount}개` };

    let zwCount = 0;
    for (let i = 0; i < len; i++) {
        const code = content.charCodeAt(i);
        if ([0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF, 0x00AD].includes(code)) zwCount++;
    }
    if (zwCount > s.maxZeroWidth) return { type: "투명문자", detail: `투명문자 ${zwCount}개` };

    return null;
}

let blockedCount = 0;
function sanitizeMessage(msg) {
    if (!msg?.content || msg._asv) return;
    const result = detectSpam(msg.content);
    if (!result) return;

    const origLen = msg.content.length;
    const safePreview = msg.content.substring(0, 60).replace(/\n/g, "↵");

    msg.content = `🛡️ **[스팸 차단]** ${result.type}\n> ${result.detail}\n> 원본: ${origLen.toLocaleString()}자 | 미리보기: \`${safePreview}…\``;
    msg._asv = true;
    blockedCount++;

    const s = getSettings();
    if (s.toastAlert && blockedCount <= 15) {
        try { showToast?.(`🛡️ ${result.type} 차단`, "warning"); } catch (e) {}
    }
}

const patches = [];

export default {
    onLoad() {
        blockedCount = 0;
        initSettings();

        let Dispatcher = null;
        try {
            Dispatcher = findByProps("dispatch", "subscribe", "wait") ?? findByProps("dispatch", "subscribe", "_dispatch") ?? findByProps("dispatch", "subscribe");
        } catch (e) {}

        if (!Dispatcher) return;

        const unpatch = before("dispatch", Dispatcher, ([event]) => {
            if (!event) return;
            try {
                if (event.type === "MESSAGE_CREATE" || event.type === "MESSAGE_UPDATE") {
                    if (event.message) sanitizeMessage(event.message);
                } else if (event.type === "LOAD_MESSAGES_SUCCESS" || event.type === "LOAD_MESSAGES_AROUND_SUCCESS") {
                    if (event.messages) {
                        for (let i = 0; i < event.messages.length; i++) sanitizeMessage(event.messages[i]);
                    }
                }
            } catch (err) {}
        });

        patches.push(unpatch);
    },
    onUnload() {
        for (const unpatch of patches) { try { unpatch?.(); } catch (e) {} }
        patches.length = 0;
    }
};
