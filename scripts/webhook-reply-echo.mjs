#!/usr/bin/env node
/**
 * Uji lokal: server mini yang membalas JSON { "reply": "..." } untuk WEBHOOK_REPLY_FROM_BODY.
 *
 *   node scripts/webhook-reply-echo.mjs
 *   # lalu ngrok http 8787 dan set URL device ke https://....ngrok.../
 *
 * Gateway .env: WEBHOOK_REPLY_FROM_BODY=true
 */
import http from 'node:http';

const PORT = Number(process.env.WEBHOOK_ECHO_PORT || 8787);

const server = http.createServer(async (req, res) => {
	if (req.method !== 'POST') {
		res.writeHead(405).end();
		return;
	}
	let body = '';
	for await (const chunk of req) {
		body += chunk;
		if (body.length > 1_000_000) break;
	}
	let data = {};
	try {
		data = JSON.parse(body || '{}');
	} catch {
		data = {};
	}
	const event = data.event;
	if (event && event !== 'message.incoming') {
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ ok: true, skipped: true }));
		return;
	}
	const text = String(data.message || '').trim();
	const reply = text !== '' ? `Echo: ${text}` : 'Ketik sesuatu untuk dibalas.';
	res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
	res.end(JSON.stringify({ reply }));
});

server.listen(PORT, () => {
	console.error(`webhook-reply-echo listening on http://127.0.0.1:${PORT}`);
});
