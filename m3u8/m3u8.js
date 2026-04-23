// ==UserScript==
// @name         m3u8视频侦测下载器【自动嗅探】
// @name:zh-CN   m3u8视频侦测下载器【自动嗅探】
// @name:zh-TW   m3u8視頻偵測下載器【自動嗅探】
// @name:en      M3U8 Video Detector and Downloader
// @version      0.2.0
// @description  自动检测页面m3u8视频并支持用本地下载器或播放器打开，支持在脚本内配置本地应用。
// @description:zh-CN  自动检测页面m3u8视频并支持用本地下载器或播放器打开，支持在脚本内配置本地应用。
// @description:zh-TW  自動檢測頁面m3u8視頻並支持用本地下載器或播放器打開，支持在腳本內配置本地應用。
// @description:en  Detect m3u8 and direct video URLs, then open them with configurable local downloaders and players.
// @icon         https://tools.thatwind.com/favicon.png
// @author       Frankie
// @namespace    https://tools.thatwind.com/
// @homepage     https://github.com/FrankieeW/UserScript
// @match        *://*/*
// @exclude      *://www.diancigaoshou.com/*
// @connect      *
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM.getValue
// @grant        GM_setValue
// @grant        GM.setValue
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @run-at       document-start
// @downloadURL https://raw.githubusercontent.com/FrankieeW/UserScript/main/m3u8/m3u8.js
// @updateURL https://raw.githubusercontent.com/FrankieeW/UserScript/main/m3u8/m3u8.js
// ==/UserScript==

const DEFAULT_SETTINGS = Object.freeze({
    scanMode: 'light',
    commandBridgeUrl: 'http://127.0.0.1:3210',
    commandBridgeToken: '',
    downloaderPreset: 'browser-download',
    downloaderName: 'Downloader',
    downloaderTemplate: 'native:download',
    primaryPlayerPreset: 'iina-protocol',
    primaryPlayerName: 'IINA',
    primaryPlayerTemplate: 'iina://open?url={{url}}',
    secondaryPlayerPreset: 'vlc-protocol',
    secondaryPlayerName: 'VLC',
    secondaryPlayerTemplate: 'vlc://{{rawUrl}}'
});

const LAUNCHER_PRESETS = Object.freeze({
    downloader: Object.freeze({
        custom: { name: 'Custom', template: '' },
        'browser-download': { name: 'Browser Download', template: 'native:download' },
        'browser-open': { name: 'Open In Browser', template: 'native:open' },
        'fdm-protocol': { name: 'FDM Protocol', template: 'fdm://{{rawUrl}}' },
        'fdm-cli': { name: 'FDM CLI', template: 'cmd:fdm {{rawUrl}}' }
    }),
    player: Object.freeze({
        custom: { name: 'Custom', template: '' },
        none: { name: 'Disabled', template: '' },
        'iina-protocol': { name: 'IINA Protocol', template: 'iina://open?url={{url}}' },
        'iina-cli': { name: 'IINA CLI', template: 'cmd:open -a IINA {{rawUrl}}' },
        'vlc-protocol': { name: 'VLC Protocol', template: 'vlc://{{rawUrl}}' },
        'vlc-cli': { name: 'VLC CLI', template: 'cmd:open -a VLC {{rawUrl}}' },
        'mpv-cli': { name: 'mpv CLI', template: 'cmd:mpv {{rawUrl}}' },
        'potplayer-cli': { name: 'PotPlayer CLI', template: 'cmd:PotPlayerMini64.exe {{rawUrl}}' },
        'browser-open': { name: 'Open In Browser', template: 'native:open' }
    })
});

function findPresetKey(groupName, template) {
    const presets = LAUNCHER_PRESETS[groupName];
    const normalizedTemplate = String(template || '').trim();
    const entry = Object.entries(presets).find(([, preset]) => preset.template === normalizedTemplate);
    return entry ? entry[0] : 'custom';
}

function normalizeSettings(value) {
    const raw = value && typeof value === 'object' ? value : {};
    const downloaderTemplate = typeof raw.downloaderTemplate === 'string' ? raw.downloaderTemplate.trim() : DEFAULT_SETTINGS.downloaderTemplate;
    const primaryPlayerTemplate = typeof raw.primaryPlayerTemplate === 'string' ? raw.primaryPlayerTemplate.trim() : DEFAULT_SETTINGS.primaryPlayerTemplate;
    const secondaryPlayerTemplate = typeof raw.secondaryPlayerTemplate === 'string' ? raw.secondaryPlayerTemplate.trim() : DEFAULT_SETTINGS.secondaryPlayerTemplate;
    return {
        scanMode: raw.scanMode === 'full' ? 'full' : DEFAULT_SETTINGS.scanMode,
        commandBridgeUrl: typeof raw.commandBridgeUrl === 'string' && raw.commandBridgeUrl.trim() ? raw.commandBridgeUrl.trim() : DEFAULT_SETTINGS.commandBridgeUrl,
        commandBridgeToken: typeof raw.commandBridgeToken === 'string' ? raw.commandBridgeToken.trim() : DEFAULT_SETTINGS.commandBridgeToken,
        downloaderPreset: typeof raw.downloaderPreset === 'string' && LAUNCHER_PRESETS.downloader[raw.downloaderPreset]
            ? raw.downloaderPreset
            : findPresetKey('downloader', downloaderTemplate),
        downloaderName: typeof raw.downloaderName === 'string' && raw.downloaderName.trim() ? raw.downloaderName.trim() : DEFAULT_SETTINGS.downloaderName,
        downloaderTemplate,
        primaryPlayerPreset: typeof raw.primaryPlayerPreset === 'string' && LAUNCHER_PRESETS.player[raw.primaryPlayerPreset]
            ? raw.primaryPlayerPreset
            : findPresetKey('player', primaryPlayerTemplate),
        primaryPlayerName: typeof raw.primaryPlayerName === 'string' && raw.primaryPlayerName.trim() ? raw.primaryPlayerName.trim() : DEFAULT_SETTINGS.primaryPlayerName,
        primaryPlayerTemplate,
        secondaryPlayerPreset: typeof raw.secondaryPlayerPreset === 'string' && LAUNCHER_PRESETS.player[raw.secondaryPlayerPreset]
            ? raw.secondaryPlayerPreset
            : findPresetKey('player', secondaryPlayerTemplate),
        secondaryPlayerName: typeof raw.secondaryPlayerName === 'string' && raw.secondaryPlayerName.trim() ? raw.secondaryPlayerName.trim() : DEFAULT_SETTINGS.secondaryPlayerName,
        secondaryPlayerTemplate
    };
}

function parseManifestSummary(content) {
    const text = String(content || '');
    const trimmed = text.trim();
    let duration = 0;
    let playlistCount = 0;
    let segmentCount = 0;

    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith('#EXTINF:')) {
            const durationText = line.slice('#EXTINF:'.length).split(',')[0];
            const seconds = Number.parseFloat(durationText);
            if (Number.isFinite(seconds)) duration += seconds;
            segmentCount += 1;
        } else if (line.startsWith('#EXT-X-STREAM-INF')) {
            playlistCount += 1;
        }
    }

    return {
        isManifest: trimmed.startsWith('#EXTM3U'),
        duration: duration > 0 ? duration : null,
        playlistCount,
        segmentCount
    };
}

function fillTemplate(template, values) {
    return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        if (Object.prototype.hasOwnProperty.call(values, key)) {
            return values[key];
        }
        return '';
    });
}

function hasTemplatePlaceholder(template) {
    return /\{\{\s*[a-zA-Z0-9_]+\s*\}\}/.test(String(template || ''));
}

function isCommandTemplate(template) {
    return String(template || '').trim().startsWith('cmd:');
}

function normalizeCommandTemplate(template) {
    const normalized = String(template || '').trim();
    if (!normalized) return '';
    if (!isCommandTemplate(normalized)) return '';
    const commandBody = normalized.slice(4).trim();
    if (!commandBody) return '';
    if (hasTemplatePlaceholder(commandBody)) return commandBody;
    return `${commandBody} {{rawUrl}}`;
}

function normalizeTemplateForLaunch(template) {
    const normalized = String(template || '').trim();
    if (!normalized) return '';
    if (isCommandTemplate(normalized)) return '';
    if (normalized === 'native:download' || normalized === 'native:open') return normalized;
    if (hasTemplatePlaceholder(normalized)) return normalized;
    if (normalized.endsWith('://')) return `${normalized}{{rawUrl}}`;
    return '';
}

function looksLikeM3u8Url(value) {
    if (!value) return false;
    const text = String(value);
    return /\.m3u8(?:$|[?#&])/i.test(text) || /[?&][^=]*m3u8=/i.test(text);
}

function resolveRequestUrl(input, baseUrl) {
    if (!input) return '';
    const candidate = typeof input === 'string'
        ? input
        : typeof input.url === 'string'
            ? input.url
            : String(input);

    try {
        return new URL(candidate, baseUrl || 'https://example.invalid/').href;
    } catch {
        return '';
    }
}

function inferDownloadName(urlText, fallbackExtension) {
    try {
        const url = new URL(urlText);
        const lastSegment = url.pathname.split('/').filter(Boolean).pop();
        if (lastSegment) {
            if (/\.[a-z0-9]{2,8}$/i.test(lastSegment)) return decodeURIComponent(lastSegment);
            if (fallbackExtension) return `${decodeURIComponent(lastSegment)}${fallbackExtension}`;
            return decodeURIComponent(lastSegment);
        }
    } catch {
        // Ignore parsing errors and use the fallback below.
    }

    const extension = fallbackExtension || '.bin';
    return `download${extension}`;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DEFAULT_SETTINGS,
        fillTemplate,
        hasTemplatePlaceholder,
        inferDownloadName,
        isCommandTemplate,
        LAUNCHER_PRESETS,
        looksLikeM3u8Url,
        findPresetKey,
        normalizeCommandTemplate,
        normalizeTemplateForLaunch,
        normalizeSettings,
        parseManifestSummary,
        resolveRequestUrl
    };
}

if (typeof window !== 'undefined') {
    (function () {
        'use strict';

        const SETTINGS_KEY = 'wtmzjk-local-app-settings';
        const PANEL_SHOWN_KEY = 'wtmzjk-panel-shown';
        const PANEL_X_KEY = 'wtmzjk-panel-x';
        const PANEL_Y_KEY = 'wtmzjk-panel-y';

        const T_langs = {
            en: {
                play: 'Play',
                copy: 'Copy Link',
                copied: 'Copied',
                download: 'Download',
                stop: 'Stop',
                downloading: 'Downloading',
                multiLine: 'Multi',
                mins: 'mins',
                settings: 'Settings',
                scanMode: 'Scan Mode',
                scanModeLight: 'Light Scan',
                scanModeFull: 'Full Scan',
                scanModeHint: 'Light mode focuses on network URLs and video tags. Full mode also scans page links and dynamic attributes.',
                bridgeUrl: 'Bridge URL',
                bridgeToken: 'Bridge Token',
                bridgeHint: 'Use cmd:fdm {{rawUrl}} to launch local commands through the bridge.',
                downloaderPreset: 'Downloader Preset',
                playerPreset: 'Player Preset',
                presetHint: 'Choose a preset and then keep editing the template if needed.',
                save: 'Save',
                cancel: 'Cancel',
                reset: 'Reset',
                settingsTitle: 'Local App Settings',
                settingsHint: 'Use {{url}} for encoded URLs, {{rawUrl}} for raw URLs, {{title}} for the page title.',
                downloaderName: 'Downloader Name',
                downloaderTemplate: 'Downloader Template',
                primaryPlayerName: 'Primary Player Name',
                primaryPlayerTemplate: 'Primary Player Template',
                secondaryPlayerName: 'Secondary Player Name',
                secondaryPlayerTemplate: 'Secondary Player Template',
                openFailed: 'No local app template configured. Link copied.',
                saved: 'Settings saved',
                resetDone: 'Settings reset',
                copiedAsFallback: 'Link copied as fallback',
                nativeDownload: 'Using browser download fallback',
                invalidTemplate: 'Template must include {{rawUrl}} or {{url}}',
                bridgeLaunchFailed: 'Local bridge launch failed',
                bridgeTokenMissing: 'Bridge token is required for cmd: templates',
                sentToBridge: 'Sent to local bridge',
                unknown: 'Unknown',
                configExample: 'Example: iina://open?url={{url}}'
            },
            'zh-CN': {
                play: '播放',
                copy: '复制链接',
                copied: '已复制',
                download: '下载',
                stop: '停止',
                downloading: '下载中',
                multiLine: '多轨',
                mins: '分钟',
                settings: '设置',
                scanMode: '扫描模式',
                scanModeLight: '轻量扫描',
                scanModeFull: '全面扫描',
                scanModeHint: '轻量模式只盯网络 URL 和 video 标签；全面模式会额外扫描页面链接和动态属性。',
                bridgeUrl: '桥接地址',
                bridgeToken: '桥接令牌',
                bridgeHint: '使用 cmd:fdm {{rawUrl}} 这种写法，通过本地桥接执行命令。',
                downloaderPreset: '下载器预设',
                playerPreset: '播放器预设',
                presetHint: '先选预设，再按需继续编辑模板。',
                save: '保存',
                cancel: '取消',
                reset: '重置',
                settingsTitle: '本地应用设置',
                settingsHint: '模板支持 {{url}}(编码后 URL)、{{rawUrl}}(原始 URL)、{{title}}(页面标题)。',
                downloaderName: '下载器名称',
                downloaderTemplate: '下载器模板',
                primaryPlayerName: '主播放器名称',
                primaryPlayerTemplate: '主播放器模板',
                secondaryPlayerName: '备用播放器名称',
                secondaryPlayerTemplate: '备用播放器模板',
                openFailed: '未配置本地应用模板，已复制链接',
                saved: '设置已保存',
                resetDone: '设置已重置',
                copiedAsFallback: '已复制链接作为兜底',
                nativeDownload: '未配置下载器，改用浏览器下载',
                invalidTemplate: '模板必须包含 {{rawUrl}} 或 {{url}}',
                bridgeLaunchFailed: '本地桥接执行失败',
                bridgeTokenMissing: 'cmd: 模板必须配置桥接令牌',
                sentToBridge: '已发送到本地桥接',
                unknown: '未知',
                configExample: '例如：iina://open?url={{url}}'
            }
        };

        let l = navigator.language || 'en';
        if (l.startsWith('en-')) l = 'en';
        else if (l.startsWith('zh-')) l = 'zh-CN';
        else l = 'en';
        const T = T_langs[l] || T_langs['zh-CN'];

        if (location.host.endsWith('mail.qq.com')) {
            return;
        }

        const detectedUrls = new Set();
        let itemCount = 0;
        let appSettings = normalizeSettings(DEFAULT_SETTINGS);
        let settingsOverlay;
        let settingsForm;
        let videoScanTimer = null;
        let fullScanTimer = null;

        const mgmapi = {
            addStyle(cssText, targetDocument = document) {
                const ownerDocument = targetDocument.ownerDocument || targetDocument;
                const style = ownerDocument.createElement('style');
                style.textContent = cssText;
                (targetDocument.head || targetDocument.documentElement || targetDocument).appendChild(style);
            },
            async getValue(name, defaultVal) {
                return await ((typeof GM_getValue === 'function') ? GM_getValue : GM.getValue)(name, defaultVal);
            },
            async setValue(name, value) {
                return await ((typeof GM_setValue === 'function') ? GM_setValue : GM.setValue)(name, value);
            },
            xmlHttpRequest(details) {
                return ((typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest : GM.xmlHttpRequest)(details);
            },
            download(details) {
                const url = details.url;
                const filename = details.name || 'download.mp4';
                const reportProgress = details.reportProgress || function () { };
                const onComplete = details.onComplete || function () { };
                const onError = details.onError || function () { };
                const onStop = details.onStop || function () { };

                let isCancelled = false;
                let currentAbortController = null;
                let currentGmRequest = null;

                const cancel = () => {
                    if (isCancelled) return;
                    isCancelled = true;

                    if (currentAbortController) {
                        currentAbortController.abort();
                    }

                    if (currentGmRequest && typeof currentGmRequest.abort === 'function') {
                        currentGmRequest.abort();
                    }

                    onStop();
                };

                (async () => {
                    if (isCancelled) return;

                    const currentOrigin = window.location.origin;
                    let targetOrigin;
                    try {
                        targetOrigin = new URL(url).origin;
                    } catch {
                        onError(new Error(`Invalid URL: ${url}`));
                        return;
                    }

                    if (currentOrigin === targetOrigin) {
                        reportProgress(100);
                        triggerAnchorDownload(url, filename);
                        onComplete();
                        return;
                    }

                    const supportsFileSystem = typeof unsafeWindow.showSaveFilePicker === 'function';
                    let isCorsSupported = false;

                    if (supportsFileSystem && !isCancelled) {
                        try {
                            currentAbortController = new AbortController();
                            await fetch(url, {
                                method: 'GET',
                                signal: currentAbortController.signal,
                                headers: details.headers || {}
                            });
                            isCorsSupported = true;
                            currentAbortController.abort();
                            currentAbortController = null;
                        } catch (error) {
                            if (error.name === 'AbortError') {
                                isCorsSupported = true;
                            }
                        }
                    }

                    if (isCancelled) return;

                    if (supportsFileSystem && isCorsSupported) {
                        try {
                            await streamDownload(url, filename, details.headers);
                            return;
                        } catch (error) {
                            if (isCancelled || error.name === 'AbortError') {
                                onStop();
                                return;
                            }
                        }
                    }

                    gmDownload(details);
                })();

                function triggerAnchorDownload(blobUrl, name) {
                    const element = document.createElement('a');
                    element.href = blobUrl;
                    element.download = name;
                    element.style.display = 'none';
                    document.body.appendChild(element);
                    element.click();
                    document.body.removeChild(element);
                    if (blobUrl.startsWith('blob:')) {
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                    }
                }

                async function streamDownload(downloadUrl, name, headers) {
                    let handle;
                    try {
                        handle = await unsafeWindow.showSaveFilePicker({
                            suggestedName: name,
                            types: [{
                                description: 'Video File',
                                accept: { 'video/mp4': ['.mp4'], 'application/octet-stream': ['.bin', '.ts', '.m3u8'] }
                            }]
                        });
                    } catch (error) {
                        if (error.name === 'AbortError') throw error;
                        throw new Error('Unable to open save dialog');
                    }

                    if (isCancelled) throw new Error('AbortError');

                    const writable = await handle.createWritable();
                    currentAbortController = new AbortController();
                    let response;

                    try {
                        response = await fetch(downloadUrl, {
                            headers: headers || {},
                            signal: currentAbortController.signal
                        });
                    } catch (error) {
                        await writable.close();
                        throw error;
                    }

                    if (!response.body) {
                        await writable.close();
                        throw new Error('ReadableStream not supported');
                    }

                    const reader = response.body.getReader();
                    const contentLength = +response.headers.get('Content-Length');
                    let receivedLength = 0;

                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            await writable.write(value);
                            receivedLength += value.length;
                            if (contentLength) {
                                reportProgress(Number.parseFloat(((receivedLength / contentLength) * 100).toFixed(2)));
                            }
                        }

                        await writable.close();
                        onComplete();
                    } catch (error) {
                        try { await writable.close(); } catch { }
                        if (error.name === 'AbortError' || isCancelled) {
                            throw new Error('AbortError');
                        }
                        throw error;
                    } finally {
                        currentAbortController = null;
                    }
                }

                function gmDownload(opt) {
                    currentGmRequest = mgmapi.xmlHttpRequest({
                        method: 'GET',
                        url: opt.url,
                        responseType: 'blob',
                        headers: opt.headers || {},
                        onload(response) {
                            if (isCancelled) return;
                            if (response.status >= 200 && response.status < 300) {
                                const blobUrl = URL.createObjectURL(response.response);
                                triggerAnchorDownload(blobUrl, opt.name);
                                reportProgress(100);
                                onComplete();
                            } else {
                                onError(new Error(`Request failed: ${response.status}`));
                            }
                        },
                        onprogress(event) {
                            if (isCancelled) return;
                            if (event.lengthComputable && event.total > 0) {
                                reportProgress(Number.parseFloat(((event.loaded / event.total) * 100).toFixed(2)));
                            }
                        },
                        onerror(error) {
                            if (isCancelled) return;
                            onError(error);
                        },
                        onabort() {
                            onStop();
                        }
                    });
                }

                return { cancel };
            },
            copyText(text) {
                return copyTextToClipboard(text);

                async function copyTextToClipboard(copyText) {
                    try {
                        await navigator.clipboard.writeText(copyText);
                    } catch {
                        const textarea = document.createElement('textarea');
                        textarea.textContent = copyText;
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        textarea.blur();
                        document.body.removeChild(textarea);
                    }
                }
            },
            message(text, disappearTime = 5000) {
                const id = 'f8243rd238-gm-message-panel';
                let panel = document.querySelector(`#${id}`);
                if (!panel) {
                    panel = document.createElement('div');
                    panel.id = id;
                    panel.style.cssText = `
                        position: fixed;
                        bottom: 20px;
                        right: 20px;
                        display: flex;
                        flex-direction: column;
                        align-items: end;
                        z-index: 999999999999999;
                    `;
                    (document.body || document.documentElement).appendChild(panel);
                }

                const messageDiv = document.createElement('div');
                messageDiv.innerText = text;
                messageDiv.style.cssText = `
                    padding: 6px 10px;
                    border-radius: 6px;
                    background: black;
                    box-shadow: #000 1px 2px 5px;
                    margin-top: 10px;
                    font-size: small;
                    color: #fff;
                    text-align: right;
                `;
                panel.appendChild(messageDiv);

                setTimeout(() => {
                    if (messageDiv.parentNode) {
                        messageDiv.parentNode.removeChild(messageDiv);
                    }
                }, disappearTime);
            }
        };

        const rootDiv = document.createElement('div');
        rootDiv.style.cssText = `
            position: fixed;
            z-index: 9999999999999999;
            opacity: 0.98;
            display: none;
        `;
        document.documentElement.appendChild(rootDiv);

        const shadowDOM = rootDiv.attachShadow({ mode: 'open' });
        const wrapper = document.createElement('div');
        shadowDOM.appendChild(wrapper);

        mgmapi.addStyle(`
            .wtmzjk-wrapper {
                --wt-accent: #4ea1ff;
                --wt-accent-strong: #2d6bff;
                --wt-surface: rgba(10, 16, 26, 0.84);
                --wt-surface-strong: rgba(8, 12, 20, 0.96);
                --wt-border: rgba(152, 181, 221, 0.18);
                --wt-text: #f5f8ff;
                --wt-muted: #9eadc2;
                --wt-success: #31c48d;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                color: var(--wt-text);
                min-width: min(520px, calc(100vw - 28px));
                transition: transform 160ms ease, opacity 160ms ease;
            }

            .wtmzjk-bar {
                display: flex;
                justify-content: flex-end;
                gap: 6px;
                margin-bottom: 6px;
                align-items: center;
            }

            .wtmzjk-pill,
            .wtmzjk-icon-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: 1px solid var(--wt-border);
                background:
                    radial-gradient(circle at top, rgba(78, 161, 255, 0.18), transparent 55%),
                    linear-gradient(180deg, rgba(28, 42, 66, 0.92), rgba(11, 18, 28, 0.94));
                color: var(--wt-text);
                border-radius: 999px;
                cursor: pointer;
                user-select: none;
                box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
                transition: transform 140ms ease, filter 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
                backdrop-filter: blur(14px);
            }

            .wtmzjk-pill {
                width: 52px;
                height: 52px;
                position: relative;
            }

            .wtmzjk-pill::after {
                content: attr(data-number);
                position: absolute;
                bottom: -3px;
                right: -6px;
                color: white;
                font-size: 12px;
                font-weight: 700;
                background: linear-gradient(135deg, var(--wt-accent), #7ec8ff);
                border-radius: 999px;
                padding: 3px 7px;
                box-shadow: 0 6px 16px rgba(78, 161, 255, 0.42);
            }

            .wtmzjk-icon-btn {
                width: 40px;
                height: 40px;
            }

            .wtmzjk-icon-btn:hover,
            .wtmzjk-pill:hover {
                filter: brightness(1.08);
                border-color: rgba(126, 200, 255, 0.5);
                transform: translateY(-1px) scale(1.01);
            }

            .wtmzjk-icon-btn:active,
            .wtmzjk-pill:active {
                transform: translateY(0) scale(0.98);
            }

            [data-shown="false"] .m3u8-item {
                opacity: 0;
                transform: translateY(-8px) scale(0.98);
                pointer-events: none;
                max-height: 0;
                margin: 0;
                padding-top: 0;
                padding-bottom: 0;
                overflow: hidden;
            }

            [data-shown="false"] {
                opacity: 0.8;
            }

            .m3u8-item {
                color: var(--wt-text);
                margin-bottom: 8px;
                display: flex;
                flex-direction: row;
                align-items: center;
                gap: 10px;
                background:
                    linear-gradient(180deg, rgba(17, 27, 42, 0.94), rgba(10, 17, 27, 0.96)),
                    var(--wt-surface);
                padding: 10px 12px;
                border-radius: 14px;
                font-size: 13px;
                user-select: none;
                min-width: min(520px, calc(100vw - 28px));
                border: 1px solid var(--wt-border);
                box-shadow: rgba(0, 0, 0, 0.28) 0 10px 30px;
                backdrop-filter: blur(12px);
                transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease, max-height 160ms ease, margin 160ms ease, padding 160ms ease;
                animation: wtmzjk-item-in 180ms ease-out;
            }

            .m3u8-item:hover {
                transform: translateY(-1px);
                border-color: rgba(126, 200, 255, 0.36);
                box-shadow: rgba(0, 0, 0, 0.36) 0 14px 34px;
            }

            .m3u8-item-type {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 48px;
                padding: 6px 10px;
                border-radius: 999px;
                background: rgba(78, 161, 255, 0.14);
                color: #cfe8ff;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.04em;
                text-transform: uppercase;
            }

            .m3u8-item-path {
                color: #d7e3f6;
                font-size: 12px;
                max-width: 220px;
                text-overflow: ellipsis;
                white-space: nowrap;
                overflow: hidden;
                font-weight: 500;
            }

            .m3u8-item-duration {
                color: var(--wt-muted);
                flex-grow: 1;
                min-width: 90px;
                font-size: 12px;
            }

            .m3u8-item-action {
                cursor: pointer;
                color: var(--wt-text);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 32px;
                padding: 0 11px;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.08);
                font-size: 12px;
                font-weight: 600;
                white-space: nowrap;
                transition: transform 120ms ease, filter 120ms ease, background 120ms ease, border-color 120ms ease;
            }

            .m3u8-item-action:hover {
                filter: brightness(1.06);
                transform: translateY(-1px);
                border-color: rgba(126, 200, 255, 0.28);
            }

            .m3u8-item-action:active {
                transform: translateY(0) scale(0.98);
            }

            .copy-link {
                color: #dfe8f5;
            }

            .download-btn {
                background: linear-gradient(135deg, rgba(45, 107, 255, 0.96), rgba(78, 161, 255, 0.94));
                border-color: transparent;
                box-shadow: 0 8px 18px rgba(45, 107, 255, 0.26);
            }

            .play-btn {
                background: rgba(49, 196, 141, 0.12);
                color: #d7fff0;
                border-color: rgba(49, 196, 141, 0.24);
            }

            .progress {
                color: #b8d8ff;
                background: rgba(78, 161, 255, 0.08);
                border-color: rgba(78, 161, 255, 0.2);
            }

            .stop-btn {
                background: rgba(255, 120, 120, 0.1);
                color: #ffd5d5;
                border-color: rgba(255, 120, 120, 0.2);
            }

            .wtmzjk-settings-overlay {
                position: fixed;
                inset: 0;
                background: rgba(2, 6, 12, 0.24);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2;
                opacity: 0;
                visibility: hidden;
                pointer-events: none;
                transition: opacity 160ms ease, background 160ms ease, visibility 160ms ease;
                backdrop-filter: blur(8px);
            }

            .wtmzjk-settings-overlay[data-open="true"] {
                opacity: 1;
                visibility: visible;
                pointer-events: auto;
                background: rgba(2, 6, 12, 0.58);
            }

            .wtmzjk-settings-card {
                width: min(640px, calc(100vw - 40px));
                max-height: min(78vh, 860px);
                overflow: auto;
                background:
                    radial-gradient(circle at top right, rgba(78, 161, 255, 0.12), transparent 30%),
                    linear-gradient(180deg, rgba(17, 22, 29, 0.98), rgba(10, 14, 20, 0.99));
                color: white;
                border-radius: 18px;
                padding: 20px;
                box-shadow: rgba(0, 0, 0, 0.46) 0 24px 60px;
                border: 1px solid rgba(148, 183, 223, 0.16);
                transform: translateY(14px) scale(0.98);
                transition: transform 180ms ease;
            }

            .wtmzjk-settings-overlay[data-open="true"] .wtmzjk-settings-card {
                transform: translateY(0) scale(1);
            }

            .wtmzjk-settings-card h3 {
                margin: 0 0 8px;
                font-size: 19px;
                letter-spacing: 0.01em;
            }

            .wtmzjk-settings-card p {
                margin: 0 0 16px;
                color: #bcc4ce;
                font-size: 12px;
                line-height: 1.5;
            }

            .wtmzjk-field {
                display: flex;
                flex-direction: column;
                gap: 6px;
                margin-bottom: 12px;
            }

            .wtmzjk-field label {
                font-size: 12px;
                color: #dce5ef;
            }

            .wtmzjk-field input,
            .wtmzjk-field select {
                border: 1px solid #2c3642;
                background: #0b0f14;
                color: white;
                border-radius: 8px;
                padding: 10px 12px;
                font-size: 13px;
                transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease;
                outline: none;
            }

            .wtmzjk-field input:focus,
            .wtmzjk-field select:focus {
                border-color: rgba(78, 161, 255, 0.56);
                box-shadow: 0 0 0 3px rgba(78, 161, 255, 0.14);
                background: #0d131b;
            }

            .wtmzjk-field-hint {
                color: #9aa7b6;
                font-size: 11px;
                line-height: 1.4;
            }

            .wtmzjk-settings-actions {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 16px;
            }

            .wtmzjk-settings-actions button {
                border: none;
                border-radius: 10px;
                padding: 10px 14px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                transition: transform 120ms ease, filter 120ms ease, box-shadow 120ms ease;
            }

            .wtmzjk-settings-actions button:hover {
                filter: brightness(1.05);
                transform: translateY(-1px);
            }

            .wtmzjk-settings-actions button:active {
                transform: translateY(0) scale(0.98);
            }

            .wtmzjk-btn-secondary {
                background: #243140;
                color: white;
            }

            .wtmzjk-btn-primary {
                background: #2d6bff;
                color: white;
                box-shadow: 0 10px 22px rgba(45, 107, 255, 0.24);
            }

            @keyframes wtmzjk-item-in {
                from {
                    opacity: 0;
                    transform: translateY(-8px) scale(0.985);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            @media (max-width: 720px) {
                .wtmzjk-wrapper {
                    min-width: calc(100vw - 18px);
                }

                .m3u8-item {
                    min-width: calc(100vw - 18px);
                    flex-wrap: wrap;
                    gap: 8px;
                    padding: 10px;
                }

                .m3u8-item-path,
                .m3u8-item-duration {
                    max-width: 100%;
                    min-width: 0;
                    flex-basis: 100%;
                }

                .wtmzjk-bar {
                    gap: 8px;
                }

                .wtmzjk-settings-card {
                    width: calc(100vw - 18px);
                    max-height: calc(100vh - 20px);
                    padding: 16px;
                }
            }
        `, shadowDOM);

        wrapper.className = 'wtmzjk-wrapper';
        wrapper.setAttribute('data-shown', 'true');
        wrapper.innerHTML = `
            <div class="wtmzjk-bar">
                <span class="wtmzjk-icon-btn" data-action="settings" title="${T.settings}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path fill="currentColor" d="M19.14 12.94a7.43 7.43 0 0 0 .05-.94 7.43 7.43 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.65l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.1 7.1 0 0 0-1.63-.94l-.36-2.54a.48.48 0 0 0-.49-.41h-3.84a.48.48 0 0 0-.49.41l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.68 8.83a.5.5 0 0 0 .12.65l2.03 1.58a7.43 7.43 0 0 0-.05.94c0 .32.02.63.05.94L2.8 14.52a.5.5 0 0 0-.12.65l1.92 3.32c.14.24.43.34.69.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.05.24.25.41.49.41h3.84c.24 0 .44-.17.49-.41l.36-2.54c.58-.23 1.12-.54 1.63-.94l2.39.96c.26.12.55.02.69-.22l1.92-3.32a.5.5 0 0 0-.12-.65l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"/>
                    </svg>
                </span>
                <span class="wtmzjk-pill" data-action="toggle" data-number="0" title="Toggle">
                    <svg style="filter: invert(1);" width="24" height="24" viewBox="0 0 585.913 585.913">
                        <path d="M11.173 46.2v492.311l346.22 47.402V535.33c.776.058 1.542.109 2.329.109h177.39c20.75 0 37.627-16.883 37.627-37.627V86.597c0-20.743-16.877-37.628-37.627-37.628h-177.39c-.781 0-1.553.077-2.329.124V0L11.173 46.2Zm379.7 318.319V245.241c0-1.07.615-2.071 1.586-2.521.981-.483 2.13-.365 2.981.307l93.393 59.623a2.8 2.8 0 0 1 1.065 2.215 2.8 2.8 0 0 1-1.065 2.215l-93.397 59.628c-.509.4-1.114.61-1.743.61l-1.233-.289a2.85 2.85 0 0 1-1.587-2.51Z"/>
                    </svg>
                </span>
            </div>
        `;

        const barBtn = wrapper.querySelector('[data-action="toggle"]');
        const settingsBtn = wrapper.querySelector('[data-action="settings"]');

        createSettingsOverlay();

        initializePanel();
        installDetectors();
        scheduleVideoScan();
        setInterval(scheduleVideoScan, 1500);

        settingsBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openSettings();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && settingsOverlay && settingsOverlay.getAttribute('data-open') === 'true') {
                closeSettings();
            }
        });

        (async function bindPanelMove() {
            let shown = await mgmapi.getValue(PANEL_SHOWN_KEY, true);
            wrapper.setAttribute('data-shown', String(shown));

            let x = await mgmapi.getValue(PANEL_X_KEY, 10);
            let y = await mgmapi.getValue(PANEL_Y_KEY, 10);

            x = Math.min(innerWidth - 50, x);
            y = Math.min(innerHeight - 50, y);
            if (x < 0) x = 0;
            if (y < 0) y = 0;

            rootDiv.style.top = `${y}px`;
            rootDiv.style.right = `${x}px`;

            barBtn.addEventListener('mousedown', (event) => {
                const startX = event.pageX;
                const startY = event.pageY;
                let moved = false;

                const mousemove = (moveEvent) => {
                    const offsetX = moveEvent.pageX - startX;
                    const offsetY = moveEvent.pageY - startY;
                    if (moved || (Math.abs(offsetX) + Math.abs(offsetY)) > 5) {
                        moved = true;
                        rootDiv.style.top = `${y + offsetY}px`;
                        rootDiv.style.right = `${x - offsetX}px`;
                    }
                };

                const mouseup = (upEvent) => {
                    const offsetX = upEvent.pageX - startX;
                    const offsetY = upEvent.pageY - startY;

                    if (moved) {
                        x -= offsetX;
                        y += offsetY;
                        mgmapi.setValue(PANEL_X_KEY, x);
                        mgmapi.setValue(PANEL_Y_KEY, y);
                    } else {
                        shown = !shown;
                        mgmapi.setValue(PANEL_SHOWN_KEY, shown);
                        wrapper.setAttribute('data-shown', String(shown));
                    }

                    removeEventListener('mousemove', mousemove);
                    removeEventListener('mouseup', mouseup);
                };

                addEventListener('mousemove', mousemove);
                addEventListener('mouseup', mouseup);
            });
        })();

        async function initializePanel() {
            appSettings = normalizeSettings(await mgmapi.getValue(SETTINGS_KEY, DEFAULT_SETTINGS));
            syncSettingsForm(appSettings);
            if (isFullScanMode()) {
                scheduleFullScan();
            }
        }

        function createSettingsOverlay() {
            settingsOverlay = document.createElement('div');
            settingsOverlay.className = 'wtmzjk-settings-overlay';
            settingsOverlay.setAttribute('data-open', 'false');
            settingsOverlay.innerHTML = `
                <div class="wtmzjk-settings-card">
                    <h3>${T.settingsTitle}</h3>
                    <p>${T.settingsHint}<br>${T.configExample}</p>
                    <form>
                        <div class="wtmzjk-field">
                            <label>${T.scanMode}</label>
                            <select name="scanMode">
                                <option value="light">${T.scanModeLight}</option>
                                <option value="full">${T.scanModeFull}</option>
                            </select>
                            <span class="wtmzjk-field-hint">${T.scanModeHint}</span>
                        </div>
                        <div class="wtmzjk-field">
                            <label>${T.bridgeUrl}</label>
                            <input name="commandBridgeUrl" type="text" placeholder="http://127.0.0.1:3210" />
                        </div>
                        <div class="wtmzjk-field">
                            <label>${T.bridgeToken}</label>
                            <input name="commandBridgeToken" type="password" placeholder="bridge token" />
                            <span class="wtmzjk-field-hint">${T.bridgeHint}</span>
                        </div>
                        <div class="wtmzjk-field">
                            <label>${T.downloaderPreset}</label>
                            <select name="downloaderPreset">${buildPresetOptions('downloader')}</select>
                            <span class="wtmzjk-field-hint">${T.presetHint}</span>
                        </div>
                        <div class="wtmzjk-field">
                            <label>${T.downloaderName}</label>
                            <input name="downloaderName" type="text" />
                        </div>
                        <div class="wtmzjk-field">
                            <label>${T.downloaderTemplate}</label>
                            <input name="downloaderTemplate" type="text" placeholder="fdm://{{rawUrl}}" />
                        </div>
                        <div class="wtmzjk-field">
                            <label>${T.playerPreset}</label>
                            <select name="primaryPlayerPreset">${buildPresetOptions('player')}</select>
                            <span class="wtmzjk-field-hint">${T.presetHint}</span>
                        </div>
                        <div class="wtmzjk-field">
                            <label>${T.primaryPlayerName}</label>
                            <input name="primaryPlayerName" type="text" />
                        </div>
                        <div class="wtmzjk-field">
                            <label>${T.primaryPlayerTemplate}</label>
                            <input name="primaryPlayerTemplate" type="text" placeholder="iina://open?url={{url}}" />
                        </div>
                        <div class="wtmzjk-field">
                            <label>${T.playerPreset}</label>
                            <select name="secondaryPlayerPreset">${buildPresetOptions('player')}</select>
                            <span class="wtmzjk-field-hint">${T.presetHint}</span>
                        </div>
                        <div class="wtmzjk-field">
                            <label>${T.secondaryPlayerName}</label>
                            <input name="secondaryPlayerName" type="text" />
                        </div>
                        <div class="wtmzjk-field">
                            <label>${T.secondaryPlayerTemplate}</label>
                            <input name="secondaryPlayerTemplate" type="text" placeholder="vlc://{{rawUrl}}" />
                        </div>
                        <div class="wtmzjk-settings-actions">
                            <button type="button" class="wtmzjk-btn-secondary" data-settings-action="reset">${T.reset}</button>
                            <button type="button" class="wtmzjk-btn-secondary" data-settings-action="cancel">${T.cancel}</button>
                            <button type="submit" class="wtmzjk-btn-primary">${T.save}</button>
                        </div>
                    </form>
                </div>
            `;
            wrapper.appendChild(settingsOverlay);
            settingsForm = settingsOverlay.querySelector('form');
            bindPresetSelect(settingsForm.elements.namedItem('downloaderPreset'), 'downloaderTemplate', 'downloader');
            bindPresetSelect(settingsForm.elements.namedItem('primaryPlayerPreset'), 'primaryPlayerTemplate', 'player');
            bindPresetSelect(settingsForm.elements.namedItem('secondaryPlayerPreset'), 'secondaryPlayerTemplate', 'player');

            settingsOverlay.addEventListener('click', (event) => {
                if (event.target === settingsOverlay) {
                    closeSettings();
                }
            });

            settingsOverlay.querySelector('[data-settings-action="cancel"]').addEventListener('click', closeSettings);
            settingsOverlay.querySelector('[data-settings-action="reset"]').addEventListener('click', async () => {
                appSettings = normalizeSettings(DEFAULT_SETTINGS);
                syncSettingsForm(appSettings);
                await mgmapi.setValue(SETTINGS_KEY, appSettings);
                scheduleVideoScan();
                mgmapi.message(T.resetDone, 2000);
            });

            settingsForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                appSettings = normalizeSettings(Object.fromEntries(new FormData(settingsForm).entries()));
                syncSettingsForm(appSettings);
                await mgmapi.setValue(SETTINGS_KEY, appSettings);
                scheduleVideoScan();
                if (isFullScanMode()) scheduleFullScan();
                mgmapi.message(T.saved, 2000);
                closeSettings();
            });
        }

        function syncSettingsForm(settings) {
            if (!settingsForm) return;
            for (const [key, value] of Object.entries(settings)) {
                const input = settingsForm.elements.namedItem(key);
                if (input) input.value = value;
            }
        }

        function buildPresetOptions(groupName) {
            return Object.entries(LAUNCHER_PRESETS[groupName]).map(([key, preset]) => (
                `<option value="${key}">${preset.name}</option>`
            )).join('');
        }

        function bindPresetSelect(selectElement, templateFieldName, groupName) {
            if (!selectElement) return;
            const templateInput = settingsForm.elements.namedItem(templateFieldName);
            selectElement.addEventListener('change', () => {
                const preset = LAUNCHER_PRESETS[groupName][selectElement.value];
                if (!templateInput || !preset) return;
                if (selectElement.value !== 'custom') {
                    templateInput.value = preset.template;
                }
            });
            if (templateInput) {
                templateInput.addEventListener('input', () => {
                    const matchedPreset = findPresetKey(groupName, templateInput.value);
                    selectElement.value = matchedPreset;
                });
            }
        }

        function openSettings() {
            syncSettingsForm(appSettings);
            settingsOverlay.setAttribute('data-open', 'true');
        }

        function closeSettings() {
            settingsOverlay.setAttribute('data-open', 'false');
        }

        function isFullScanMode() {
            return appSettings.scanMode === 'full';
        }

        function installDetectors() {
            const originalFetch = unsafeWindow.fetch;
            if (typeof originalFetch === 'function') {
                unsafeWindow.fetch = async function (...args) {
                    const response = await originalFetch.apply(this, args);
                    inspectFetchResponse(args[0], response);
                    return response;
                };
            }

            const originalResponseText = unsafeWindow.Response && unsafeWindow.Response.prototype && unsafeWindow.Response.prototype.text;
            if (typeof originalResponseText === 'function') {
                unsafeWindow.Response.prototype.text = function () {
                    return new Promise((resolve, reject) => {
                        originalResponseText.call(this).then((text) => {
                            resolve(text);
                            inspectManifestCandidate(this.url, text);
                        }).catch(reject);
                    });
                };
            }

            const originalXhrOpen = unsafeWindow.XMLHttpRequest && unsafeWindow.XMLHttpRequest.prototype && unsafeWindow.XMLHttpRequest.prototype.open;
            if (typeof originalXhrOpen === 'function') {
                unsafeWindow.XMLHttpRequest.prototype.open = function (...args) {
                    const requestUrl = resolveRequestUrl(args[1], location.href);
                    if (looksLikeM3u8Url(requestUrl)) {
                        queueM3uCandidate(requestUrl);
                    }

                    this.addEventListener('load', () => {
                        try {
                            const responseUrl = this.responseURL || requestUrl;
                            inspectManifestCandidate(responseUrl, this.responseText);
                        } catch {
                            // Ignore unreadable XHR responses.
                        }
                    });

                    return originalXhrOpen.apply(this, args);
                };
            }

            whenDOMReady(() => {
                const observer = new MutationObserver(() => {
                    scheduleVideoScan();
                    if (isFullScanMode()) {
                        scheduleFullScan();
                    }
                });
                observer.observe(document.documentElement, {
                    childList: true,
                    subtree: true
                });
            });
        }

        function scheduleVideoScan() {
            if (videoScanTimer) return;
            videoScanTimer = setTimeout(() => {
                videoScanTimer = null;
                doVideos();
            }, 250);
        }

        function scheduleFullScan() {
            if (fullScanTimer) return;
            fullScanTimer = setTimeout(() => {
                fullScanTimer = null;
                scanDocumentForMediaLinks();
            }, 350);
        }

        function inspectFetchResponse(input, response) {
            const requestUrl = resolveRequestUrl(input, location.href);
            const responseUrl = resolveRequestUrl(response && response.url, location.href) || requestUrl;

            if (looksLikeM3u8Url(responseUrl)) {
                queueM3uCandidate(responseUrl);
            }

            const contentType = response && response.headers && typeof response.headers.get === 'function'
                ? (response.headers.get('content-type') || '')
                : '';

            if (contentType.includes('mpegurl') && response && typeof response.clone === 'function') {
                response.clone().text().then((text) => {
                    inspectManifestCandidate(responseUrl, text);
                }).catch(() => { });
            } else if (isFullScanMode() && looksLikeM3u8Url(responseUrl) && response && typeof response.clone === 'function') {
                response.clone().text().then((text) => {
                    inspectManifestCandidate(responseUrl, text);
                }).catch(() => { });
            }
        }

        function inspectManifestCandidate(url, content) {
            const summary = parseManifestSummary(content);
            if (!summary.isManifest) return;
            doM3U({ url, content, summary }).catch(() => { });
        }

        function queueM3uCandidate(url) {
            if (!url || detectedUrls.has(url)) return;
            doM3U({ url }).catch(() => { });
        }

        function doVideos() {
            for (const video of Array.from(document.querySelectorAll('video'))) {
                const sources = [video.currentSrc, video.src]
                    .concat(Array.from(video.querySelectorAll('source[src]')).map((node) => node.src))
                    .filter((value, index, list) => value && list.indexOf(value) === index);

                for (const source of sources) {
                    if (!source.startsWith('http') || detectedUrls.has(source)) continue;
                    detectedUrls.add(source);
                    showVideo({
                        type: 'video',
                        url: new URL(source),
                        duration: Number.isFinite(video.duration) && video.duration > 0
                            ? `${Math.ceil(video.duration * 10 / 60) / 10} ${T.mins}`
                            : T.unknown,
                        fallbackExtension: '.mp4',
                        supportsPlay: isActionConfigured(appSettings.primaryPlayerTemplate) || isActionConfigured(appSettings.secondaryPlayerTemplate)
                    });
                }
            }
        }

        function scanDocumentForMediaLinks() {
            const selectors = [
                'a[href]',
                'source[src]',
                'video[src]',
                'meta[content]',
                '[data-url]',
                '[data-src]',
                '[data-play]',
                '[data-play-url]',
                '[data-m3u8]',
                '[content]'
            ];
            const attributes = ['href', 'src', 'content', 'data-url', 'data-src', 'data-play', 'data-play-url', 'data-m3u8'];

            for (const node of Array.from(document.querySelectorAll(selectors.join(',')))) {
                for (const attribute of attributes) {
                    const value = node.getAttribute && node.getAttribute(attribute);
                    if (!looksLikeM3u8Url(value)) continue;
                    const absoluteUrl = resolveRequestUrl(value, location.href);
                    if (absoluteUrl) {
                        queueM3uCandidate(absoluteUrl);
                    }
                }
            }
        }

        async function doM3U({ url, content, summary }) {
            const manifestUrl = new URL(url, location.href);
            if (detectedUrls.has(manifestUrl.href)) return;

            let manifestText = content;
            if (!manifestText) {
                try {
                    manifestText = await (await fetch(manifestUrl.href)).text();
                } catch {
                    manifestText = '';
                }
            }

            const manifestSummary = summary || parseManifestSummary(manifestText);
            if (!manifestSummary.isManifest) return;

            detectedUrls.add(manifestUrl.href);

            let durationLabel = T.unknown;
            if (manifestSummary.duration) {
                durationLabel = `${Math.ceil(manifestSummary.duration * 10 / 60) / 10} ${T.mins}`;
            } else if (manifestSummary.playlistCount) {
                durationLabel = `${T.multiLine}(${manifestSummary.playlistCount})`;
            }

            showVideo({
                type: 'm3u8',
                url: manifestUrl,
                duration: durationLabel,
                fallbackExtension: '.m3u8',
                supportsPlay: isActionConfigured(appSettings.primaryPlayerTemplate) || isActionConfigured(appSettings.secondaryPlayerTemplate)
            });
        }

        function showVideo({ type, url, duration, fallbackExtension, supportsPlay }) {
            const div = document.createElement('div');
            div.className = 'm3u8-item';
            div.innerHTML = `
                <span class="m3u8-item-type"${type === 'm3u8' ? ' style="background:rgba(78,161,255,0.18);color:#d8ecff;"' : ' style="background:rgba(49,196,141,0.12);color:#d7fff0;border-color:rgba(49,196,141,0.2);"' }>${type}</span>
                <span class="m3u8-item-path" title="${url.href}">${url.pathname || url.href}</span>
                <span class="m3u8-item-duration">${duration}</span>
                <span class="m3u8-item-action copy-link" title="${T.copy}">${T.copy}</span>
                <span class="m3u8-item-action download-btn" title="${appSettings.downloaderName || T.download}">${appSettings.downloaderName || T.download}</span>
                ${supportsPlay ? `<span class="m3u8-item-action play-btn" title="${appSettings.primaryPlayerName || T.play}">${appSettings.primaryPlayerName || T.play}</span>` : ''}
                <span class="m3u8-item-action progress" style="display:none;" title="${T.downloading}"></span>
                <span class="m3u8-item-action stop-btn" style="display:none;" title="${T.stop}">${T.stop}</span>
            `;

            let cancelDownload = null;
            const downloadBtn = div.querySelector('.download-btn');
            const playBtn = div.querySelector('.play-btn');
            const stopBtn = div.querySelector('.stop-btn');
            const progressText = div.querySelector('.progress');
            const copyBtn = div.querySelector('.copy-link');

            copyBtn.addEventListener('click', async () => {
                await mgmapi.copyText(url.href);
                mgmapi.message(T.copied, 2000);
            });

            downloadBtn.addEventListener('click', () => {
                void startDownload({
                    url: url.href,
                    preferredTemplate: appSettings.downloaderTemplate,
                    fallbackName: inferDownloadName(url.href, fallbackExtension),
                    itemApi
                });
            });

            if (playBtn) {
                playBtn.addEventListener('click', async () => {
                    if (await tryOpenTemplate(appSettings.primaryPlayerTemplate, url.href)) return;
                    if (await tryOpenTemplate(appSettings.secondaryPlayerTemplate, url.href)) return;
                    if ((appSettings.primaryPlayerTemplate && !isTemplateUsable(appSettings.primaryPlayerTemplate))
                        || (appSettings.secondaryPlayerTemplate && !isTemplateUsable(appSettings.secondaryPlayerTemplate))) {
                        mgmapi.message(T.invalidTemplate, 3000);
                    }
                    await mgmapi.copyText(url.href);
                    mgmapi.message(T.openFailed, 3000);
                });
            }

            stopBtn.addEventListener('click', () => {
                if (cancelDownload) cancelDownload();
            });

            rootDiv.style.display = 'block';
            itemCount += 1;
            barBtn.setAttribute('data-number', String(itemCount));
            wrapper.appendChild(div);

            const itemApi = {
                updateDownloadState({ downloading, progress, cancel }) {
                    if (downloading) {
                        if (cancel) cancelDownload = cancel;
                        downloadBtn.style.display = 'none';
                        progressText.style.display = '';
                        progressText.textContent = `${T.downloading} ${progress}%`;
                        stopBtn.style.display = '';
                    } else {
                        cancelDownload = null;
                        downloadBtn.style.display = '';
                        progressText.style.display = 'none';
                        stopBtn.style.display = 'none';
                    }
                }
            };

            return itemApi;
        }

        async function startDownload({ url, preferredTemplate, fallbackName, itemApi }) {
            if (preferredTemplate && await tryOpenTemplate(preferredTemplate, url)) {
                return;
            }
            if (preferredTemplate && !isTemplateUsable(preferredTemplate)) {
                mgmapi.message(T.invalidTemplate, 3000);
            }

            itemApi.updateDownloadState({ downloading: true, progress: 0 });
            mgmapi.message(T.nativeDownload, 2000);

            let controller = null;
            controller = mgmapi.download({
                url,
                name: fallbackName,
                reportProgress(progress) {
                    itemApi.updateDownloadState({ downloading: true, progress, cancel: controller ? controller.cancel : null });
                },
                onComplete() {
                    itemApi.updateDownloadState({ downloading: false, progress: 100 });
                },
                onError() {
                    itemApi.updateDownloadState({ downloading: false, progress: 0 });
                    mgmapi.copyText(url);
                    mgmapi.message(T.copiedAsFallback, 3000);
                },
                onStop() {
                    itemApi.updateDownloadState({ downloading: false, progress: 0 });
                }
            });

            itemApi.updateDownloadState({ downloading: true, progress: 0, cancel: controller.cancel });
        }

        function isTemplateUsable(template) {
            return Boolean(normalizeCommandTemplate(template) || normalizeTemplateForLaunch(template));
        }

        function isActionConfigured(template) {
            return Boolean(String(template || '').trim()) && isTemplateUsable(template);
        }

        async function tryOpenTemplate(template, rawUrl) {
            const normalizedCommandTemplate = normalizeCommandTemplate(template);
            if (normalizedCommandTemplate) {
                return await tryBridgeCommand(normalizedCommandTemplate, rawUrl);
            }

            const normalizedTemplate = normalizeTemplateForLaunch(template);
            if (!normalizedTemplate) return false;
            if (normalizedTemplate === 'native:open') {
                window.open(rawUrl, '_blank', 'noopener,noreferrer');
                return true;
            }

            const values = {
                url: encodeURIComponent(rawUrl),
                rawUrl,
                pageUrl: encodeURIComponent(location.href),
                rawPageUrl: location.href,
                title: encodeURIComponent(document.title || ''),
                rawTitle: document.title || '',
                host: (() => { try { return new URL(rawUrl).host; } catch { return ''; } })(),
                filename: inferDownloadName(rawUrl, ''),
                extension: (() => {
                    const filename = inferDownloadName(rawUrl, '');
                    const match = filename.match(/(\.[^.]+)$/);
                    return match ? match[1] : '';
                })()
            };
            const target = fillTemplate(normalizedTemplate, values).trim();
            if (!target) return false;

            const link = document.createElement('a');
            link.href = target;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return true;
        }

        async function tryBridgeCommand(commandTemplate, rawUrl) {
            if (!appSettings.commandBridgeToken) {
                mgmapi.message(T.bridgeTokenMissing, 3000);
                return false;
            }

            const bridgeUrl = String(appSettings.commandBridgeUrl || '').trim();
            if (!bridgeUrl) {
                mgmapi.message(T.bridgeLaunchFailed, 3000);
                return false;
            }

            try {
                await new Promise((resolve, reject) => {
                    mgmapi.xmlHttpRequest({
                        method: 'POST',
                        url: `${bridgeUrl.replace(/\/$/, '')}/launch`,
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Bridge-Token': appSettings.commandBridgeToken
                        },
                        data: JSON.stringify({
                            commandTemplate,
                            rawUrl,
                            pageUrl: location.href,
                            title: document.title || ''
                        }),
                        onload(response) {
                            if (response.status >= 200 && response.status < 300) {
                                resolve();
                            } else {
                                reject(new Error(`Bridge failed: ${response.status}`));
                            }
                        },
                        onerror(error) {
                            reject(error);
                        }
                    });
                });
                mgmapi.message(T.sentToBridge, 1800);
                return true;
            } catch (error) {
                console.error(error);
                mgmapi.message(T.bridgeLaunchFailed, 3000);
                return false;
            }
        }

        function whenDOMReady(callback) {
            if (document.body) callback();
            else window.addEventListener('DOMContentLoaded', function listener() {
                window.removeEventListener('DOMContentLoaded', listener);
                callback();
            });
        }
    })();
}
