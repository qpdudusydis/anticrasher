/**
 * AntiSpamVaccine — Revenge (Mobile Discord) Plugin
 * 
 * 디스코드 크래셔/스팸 메시지를 렌더링 전에 즉시 차단.
 * BetterDiscord v2.2 감지 엔진 이식 — for 루프만 사용, 정규식 없음.
 * 
 * 방어 벡터:
 * - 길이 초과 (2000자+)
 * - 연속 반복 문자 (]]]]]]..., !!!!!!!!!... 100회+)
 * - 스포일러 태그 크래셔 (|| 남용)
 * - 잘고 텍스트 (Combining Characters 도배)
 * - BiDi 오버라이드 크래셔
 * - 줄바꿈 도배
 * - Zero-width 문자 도배
 */

import { findByProps } from "@vendetta/metro";
import { before } from "@vendetta/patcher";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "@vendetta/storage";

/* ═══════════════════════════════════════════════════════════
   기본 설정
   ═══════════════════════════════════════════════════════════ */
const DEFAULT_SETTINGS = {
    hardLimit: 2000,         // 즉시 차단 글자 수
    repeatLimit: 100,        // 연속 반복 허용 최대 횟수
    blockSpoilerAbuse: true, // 스포일러 태그 크래셔
    blockZalgo: true,        // 잘고 텍스트
    blockBidi: true,         // BiDi 오버라이드
    maxNewlines: 30,         // 줄바꿈 도배 임계값
    maxZeroWidth: 15,        // Zero-width 문자 임계값
    toastAlert: true,        // 차단 알림
};

/* ═══════════════════════════════════════════════════════════
   설정 관리
   ═══════════════════════════════════════════════════════════ */
function getSettings() {
    if (!storage) return { ...DEFAULT_SETTINGS };

    const s = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (storage[key] !== undefined) {
            s[key] = storage[key];
        }
    }
    return s;
}

function initSettings() {
    if (!storage) return;
    for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
        if (storage[key] === undefined) {
            storage[key] = val;
        }
    }
    if (storage.repeatLimit < 20) storage.repeatLimit = 100;
    if (storage.hardLimit < 500) storage.hardLimit = 2000;
}

/* ═══════════════════════════════════════════════════════════
   스팸/크래셔 감지 엔진
   ═══════════════════════════════════════════════════════════ */
function detectSpam(content) {
    if (!content || typeof content !== "string") return null;

    const s = getSettings();
    const len = content.length;

    if (len > s.hardLimit) {
        return {
            type: "길이초과",
            detail: `${len.toLocaleString()}자 (제한: ${s.hardLimit}자)`
        };
    }

    let maxRepeat = 0;
    let maxRepeatChar = "";
    let repeatCount = 1;
    for (let i = 1; i < len; i++) {
        if (content[i] === content[i - 1]) {
            repeatCount++;
            if (repeatCount > maxRepeat) {
                maxRepeat = repeatCount;
                maxRepeatChar = content[i];
            }
        } else {
            repeatCount = 1;
        }
    }
    if (maxRepeat >= s.repeatLimit) {
        return {
            type: "반복문자",
            detail: `'${maxRepeatChar}' × ${maxRepeat}회 연속`
        };
    }

    if (s.blockSpoilerAbuse) {
        let spoilerCount = 0;
        for (let i = 0; i < len - 1; i++) {
            if (content[i] === "|" && content[i + 1] === "|") {
                spoilerCount++;
                i++;
            }
        }
        if (spoilerCount > 20) {
            return {
                type: "스포일러크래셔",
                detail: `스포일러 태그 ${spoilerCount}개`
            };
        }
    }

    if (s.blockZalgo) {
        let combiningCount = 0;
        for (let i = 0; i < len; i++) {
            const code = content.charCodeAt(i);
            if ((code >= 0x0300 && code <= 0x036F) ||
                (code >= 0x0489 && code <= 0x0489) ||
                (code >= 0x1AB0 && code <= 0x1AFF) ||
                (code >= 0x1DC0 && code <= 0x1DFF) ||
                (code >= 0x20D0 && code <= 0x20FF) ||
                (code >= 0xFE00 && code <= 0xFE0F) ||
                (code >= 0xFE20 && code <= 0xFE2F)) {
                combiningCount++;
            }
        }
        if (combiningCount > 30) {
            return {
                type: "잘고텍스트",
                detail: `결합문자 ${combiningCount}개`
            };
        }
    }

    if (s.blockBidi) {
        let bidiCount = 0;
        for (let i = 0; i < len; i++) {
            const code = content.charCodeAt(i);
            if (code === 0x200E || code === 0x200F ||
                code === 0x202A || code === 0x202B ||
                code === 0x202C || code === 0x202D ||
                code === 0x202E ||
                code === 0x2066 || code === 0x2067 ||
                code === 0x2068 || code === 0x2069) {
                bidiCount++;
            }
        }
        if (bidiCount > 10) {
            return {
                type: "BiDi크래셔",
                detail: `방향 오버라이드 문자 ${bidiCount}개`
            };
        }
    }

    let nlCount = 0;
    for (let i = 0; i < len; i++) {
        if (content[i] === "\n") nlCount++;
    }
    if (nlCount > s.maxNewlines) {
        return {
            type: "줄바꿈도배",
            detail: `줄바꿈 ${nlCount}개`
        };
    }

    let zwCount = 0;
    for (let i = 0; i < len; i++) {
        const code = content.charCodeAt(i);
        if (code === 0x200B || code === 0x200C ||
            code === 0x200D || code === 0x2060 ||
            code === 0xFEFF || code === 0x00AD) {
            zwCount++;
        }
    }
    if (zwCount > s.maxZeroWidth) {
        return {
            type: "투명문자",
            detail: `보이지 않는 문자 ${zwCount}개`
        };
    }

    return null;
}

/* ═══════════════════════════════════════════════════════════
   메시지 소독
   ═══════════════════════════════════════════════════════════ */
let blockedCount = 0;

function sanitizeMessage(msg) {
    if (!msg?.content) return;
    if (msg._asv) return;

    const result = detectSpam(msg.content);
    if (!result) return;

    const origLen = msg.content.length;
    const safePreview = msg.content.substring(0, 60).replace(/\n/g, "↵");

    msg.content =
        `🛡️ **[스팸 차단]** ${result.type}\n` +
        `> ${result.detail}\n` +
        `> 원본: ${origLen.toLocaleString()}자 | 미리보기: \`${safePreview}…\``;
    msg._asv = true;

    blockedCount++;

    const s = getSettings();
    if (s.toastAlert && blockedCount <= 15) {
        try {
            showToast?.(
                `🛡️ ${result.type} 차단 (${origLen.toLocaleString()}자)`,
                "warning"
            );
        } catch (e) {}
    }
}

/* ═══════════════════════════════════════════════════════════
   플러그인 라이프사이클
   ═══════════════════════════════════════════════════════════ */
const patches = [];

export default {
    onLoad() {
        blockedCount = 0;
        initSettings();

        let Dispatcher = null;
        try {
            Dispatcher =
                findByProps("dispatch", "subscribe", "wait") ??
                findByProps("dispatch", "subscribe", "_dispatch") ??
                findByProps("dispatch", "subscribe");
        } catch (e) {
            console.error("[ASV] Dispatcher 탐색 실패:", e);
        }

        if (!Dispatcher) {
            console.warn("[ASV] FluxDispatcher를 찾을 수 없음");
            return;
        }

        const unpatch = before("dispatch", Dispatcher, ([event]) => {
            if (!event) return;
            try {
                switch (event.type) {
                    case "MESSAGE_CREATE":
                    case "MESSAGE_UPDATE":
                        if (event.message) sanitizeMessage(event.message);
                        break;
                    case "LOAD_MESSAGES_SUCCESS":
                    case "LOAD_MESSAGES_AROUND_SUCCESS":
                        if (event.messages) {
                            for (let i = 0; i < event.messages.length; i++) {
                                sanitizeMessage(event.messages[i]);
                            }
                        }
                        break;
                }
            } catch (err) {
                console.error("[ASV] dispatch 패치 오류:", err);
            }
        });

        patches.push(unpatch);
        console.log("[ASV] AntiSpamVaccine 로드 완료");
    },

    onUnload() {
        for (const unpatch of patches) {
            try { unpatch?.(); } catch (e) {}
        }
        patches.length = 0;
        console.log(`[ASV] 언로드 완료 (차단: ${blockedCount}건)`);
    }
};
