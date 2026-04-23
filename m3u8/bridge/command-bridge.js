#!/usr/bin/env node

'use strict';

const http = require('node:http');
const os = require('node:os');
const { spawn } = require('node:child_process');

const HOST = process.env.BRIDGE_HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.BRIDGE_PORT || '3210', 10);
const TOKEN = process.env.BRIDGE_TOKEN || '';

if (!TOKEN) {
    console.error('BRIDGE_TOKEN is required');
    process.exit(1);
}

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload));
}

function readJson(request) {
    return new Promise((resolve, reject) => {
        let body = '';
        request.setEncoding('utf8');
        request.on('data', (chunk) => {
            body += chunk;
            if (body.length > 1024 * 1024) {
                reject(new Error('Payload too large'));
            }
        });
        request.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(error);
            }
        });
        request.on('error', reject);
    });
}

function quoteForShell(value) {
    const text = String(value || '');
    if (process.platform === 'win32') {
        return `"${text.replace(/(["^%])/g, '^$1')}"`;
    }
    return `'${text.replace(/'/g, `'\\''`)}'`;
}

function fillCommandTemplate(template, payload) {
    const values = {
        rawUrl: quoteForShell(payload.rawUrl),
        pageUrl: quoteForShell(payload.pageUrl),
        title: quoteForShell(payload.title),
        rawUrlLiteral: String(payload.rawUrl || ''),
        pageUrlLiteral: String(payload.pageUrl || ''),
        titleLiteral: String(payload.title || '')
    };

    return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        if (Object.prototype.hasOwnProperty.call(values, key)) {
            return values[key];
        }
        return '';
    }).trim();
}

function launchCommand(command) {
    const child = spawn(command, {
        detached: true,
        shell: true,
        stdio: 'ignore'
    });
    child.unref();
}

const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
        sendJson(response, 200, {
            ok: true,
            host: HOST,
            port: PORT,
            platform: os.platform()
        });
        return;
    }

    if (request.method !== 'POST' || request.url !== '/launch') {
        sendJson(response, 404, { ok: false, error: 'Not found' });
        return;
    }

    if (request.headers['x-bridge-token'] !== TOKEN) {
        sendJson(response, 403, { ok: false, error: 'Invalid token' });
        return;
    }

    try {
        const payload = await readJson(request);
        if (!payload || typeof payload.commandTemplate !== 'string') {
            sendJson(response, 400, { ok: false, error: 'commandTemplate is required' });
            return;
        }

        const command = fillCommandTemplate(payload.commandTemplate, payload);
        if (!command) {
            sendJson(response, 400, { ok: false, error: 'Command is empty after template expansion' });
            return;
        }

        launchCommand(command);
        sendJson(response, 200, { ok: true, command });
    } catch (error) {
        sendJson(response, 500, { ok: false, error: error.message });
    }
});

server.listen(PORT, HOST, () => {
    console.log(`Command bridge listening on http://${HOST}:${PORT}`);
});
