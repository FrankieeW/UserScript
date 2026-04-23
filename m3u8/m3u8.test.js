const assert = require('node:assert/strict');
const {
    DEFAULT_SETTINGS,
    fillTemplate,
    findPresetKey,
    hasTemplatePlaceholder,
    inferDownloadName,
    isCommandTemplate,
    LAUNCHER_PRESETS,
    looksLikeM3u8Url,
    normalizeCommandTemplate,
    normalizeTemplateForLaunch,
    normalizeSettings,
    parseManifestSummary,
    resolveRequestUrl
} = require('./m3u8.js');

assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
assert.equal(normalizeSettings({ scanMode: 'full' }).scanMode, 'full');
assert.equal(normalizeSettings({ scanMode: 'weird' }).scanMode, 'light');
assert.equal(normalizeSettings({ downloaderTemplate: 'fdm://{{rawUrl}}' }).downloaderPreset, 'fdm-protocol');
assert.equal(normalizeSettings({ downloaderName: '  FDM  ' }).downloaderName, 'FDM');
assert.equal(findPresetKey('downloader', LAUNCHER_PRESETS.downloader['browser-download'].template), 'browser-download');
assert.equal(fillTemplate('vlc://{{rawUrl}}', { rawUrl: 'https://video.test/a.m3u8' }), 'vlc://https://video.test/a.m3u8');
assert.equal(hasTemplatePlaceholder('fdm://{{rawUrl}}'), true);
assert.equal(hasTemplatePlaceholder('fdm://'), false);
assert.equal(isCommandTemplate('cmd:fdm {{rawUrl}}'), true);
assert.equal(isCommandTemplate('fdm://{{rawUrl}}'), false);
assert.equal(normalizeCommandTemplate('cmd:fdm'), 'fdm {{rawUrl}}');
assert.equal(normalizeCommandTemplate('cmd:fdm {{rawUrl}}'), 'fdm {{rawUrl}}');
assert.equal(normalizeTemplateForLaunch('fdm://'), 'fdm://{{rawUrl}}');
assert.equal(normalizeTemplateForLaunch('native:open'), 'native:open');
assert.equal(normalizeTemplateForLaunch('native:download'), 'native:download');
assert.equal(normalizeTemplateForLaunch('fdm://test'), '');
assert.equal(looksLikeM3u8Url('https://video.test/live/index.m3u8?token=1'), true);
assert.equal(looksLikeM3u8Url('https://video.test/clip.mp4'), false);
assert.equal(resolveRequestUrl('/api/video.m3u8', 'https://example.com/watch').startsWith('https://example.com/'), true);
assert.equal(inferDownloadName('https://video.test/path/master.m3u8', '.m3u8'), 'master.m3u8');

const summary = parseManifestSummary(`#EXTM3U
#EXT-X-VERSION:3
#EXTINF:5.0,
seg-1.ts
#EXTINF:4.5,
seg-2.ts
`);

assert.equal(summary.isManifest, true);
assert.equal(summary.segmentCount, 2);
assert.equal(summary.playlistCount, 0);
assert.equal(summary.duration, 9.5);

const multiSummary = parseManifestSummary(`#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=123456
index-720.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=654321
index-1080.m3u8
`);

assert.equal(multiSummary.playlistCount, 2);
console.log('m3u8 smoke tests passed');
