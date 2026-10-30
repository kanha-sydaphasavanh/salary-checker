import assert from "node:assert/strict";
import test from "node:test";
import { TelegramApi } from "../TelegramBotApi.js";

const createTelegramApi = () => {
    const telegramApi = new TelegramApi();
    const calls = [];

    telegramApi.api = {
        post: async (url, data, config) => {
            calls.push({ method: "post", url, data, config });
            return { data: { ok: true } };
        },
        get: async (url, config) => {
            calls.push({ method: "get", url, config });
            return { data: { ok: true, result: [] } };
        }
    };

    return { telegramApi, calls };
};

test("sendMessage sends the chat ID and text", async () => {
    const { telegramApi, calls } = createTelegramApi();

    const result = await telegramApi.sendMessage("chat-123", "Bonjour");

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls[0], {
        method: "post",
        url: "/sendMessage",
        data: { chat_id: "chat-123", text: "Bonjour" },
        config: undefined
    });
});

test("sendPayslipPrompt sends Oui/Non buttons and keeps the file pending", async () => {
    const { telegramApi, calls } = createTelegramApi();
    const fileBuffer = Buffer.from("payslip");

    await telegramApi.sendPayslipPrompt("chat-123", "fiche.pdf", fileBuffer);

    const message = calls[0].data;
    const buttons = message.reply_markup.inline_keyboard[0];
    const requestId = buttons[0].callback_data.split(":")[1];

    assert.equal(message.chat_id, "chat-123");
    assert.match(message.text, /télécharger/i);
    assert.deepEqual(buttons.map(({ text }) => text), ["Oui", "Non"]);
    assert.equal(telegramApi.pendingPayslips.get(requestId).fileName, "fiche.pdf");
    assert.equal(telegramApi.pendingPayslips.get(requestId).fileBuffer, fileBuffer);
});

test("sendPayslipPrompt removes the pending file if Telegram rejects the message", async () => {
    const { telegramApi } = createTelegramApi();
    const error = new Error("Telegram unavailable");
    telegramApi.api.post = async () => {
        throw error;
    };
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
        await assert.rejects(telegramApi.sendPayslipPrompt("chat-123", "fiche.pdf", Buffer.from("pdf")), error);
        assert.equal(telegramApi.pendingPayslips.size, 0);
    } finally {
        console.error = originalConsoleError;
    }
});

test("waitForPayslipDecision sends the document after Oui and removes the buttons", async () => {
    const { telegramApi, calls } = createTelegramApi();
    const fileBuffer = Buffer.from("payslip content");
    await telegramApi.sendPayslipPrompt("chat-123", "fiche.pdf", fileBuffer);
    const callbackData = calls[0].data.reply_markup.inline_keyboard[0][0].callback_data;
    const posts = [];
    telegramApi.api.post = async (url, data, config) => {
        posts.push({ url, data, config });
        return { data: { ok: true } };
    };
    telegramApi.api.get = async () => ({
        data: {
            ok: true,
            result: [{
                update_id: 7,
                callback_query: {
                    id: "callback-1",
                    data: callbackData,
                    message: { chat: { id: "chat-123" }, message_id: 42 }
                }
            }]
        }
    });

    await telegramApi.waitForPayslipDecision("chat-123");

    const documentCall = posts.find(({ url }) => url === "/sendDocument");
    assert.ok(documentCall);
    assert.equal(documentCall.data.get("chat_id"), "chat-123");
    assert.equal(documentCall.data.get("document").name, "fiche.pdf");
    assert.deepEqual(
        Buffer.from(await documentCall.data.get("document").arrayBuffer()),
        fileBuffer
    );
    assert.deepEqual(posts.at(-1), {
        url: "/editMessageText",
        data: {
            chat_id: "chat-123",
            message_id: 42,
            text: "Fichier envoyé : fiche.pdf",
            reply_markup: { inline_keyboard: [] }
        },
        config: undefined
    });
    assert.equal(telegramApi.pendingPayslips.size, 0);
});

test("waitForPayslipDecision does not send the document after Non", async () => {
    const { telegramApi, calls } = createTelegramApi();
    await telegramApi.sendPayslipPrompt("chat-123", "fiche.pdf", Buffer.from("payslip"));
    const callbackData = calls[0].data.reply_markup.inline_keyboard[0][1].callback_data;
    const posts = [];
    telegramApi.api.post = async (url, data) => {
        posts.push({ url, data });
        return { data: { ok: true } };
    };
    telegramApi.api.get = async () => ({
        data: {
            ok: true,
            result: [{
                update_id: 7,
                callback_query: {
                    id: "callback-2",
                    data: callbackData,
                    message: { chat: { id: "chat-123" }, message_id: 43 }
                }
            }]
        }
    });

    await telegramApi.waitForPayslipDecision("chat-123");

    assert.equal(posts.some(({ url }) => url === "/sendDocument"), false);
    assert.equal(posts.at(-1).data.text, "Téléchargement annulé : fiche.pdf");
    assert.equal(telegramApi.pendingPayslips.size, 0);
});

test("waitForPayslipDecision ignores stale callback queries instead of crashing on 400", async () => {
    const { telegramApi, calls } = createTelegramApi();
    const fileBuffer = Buffer.from("payslip content");
    await telegramApi.sendPayslipPrompt("chat-123", "fiche.pdf", fileBuffer);
    const callbackData = calls[0].data.reply_markup.inline_keyboard[0][0].callback_data;
    const posts = [];

    let getCalls = 0;
    telegramApi.api.get = async () => {
        getCalls += 1;
        if (getCalls === 1) {
            return {
                data: {
                    ok: true,
                    result: [{
                        update_id: 1,
                        callback_query: {
                            id: "stale-callback",
                            data: "payslip_yes:unknown-request",
                            message: { chat: { id: "chat-123" }, message_id: 10 }
                        }
                    }]
                }
            };
        }

        return {
            data: {
                ok: true,
                result: [{
                    update_id: 2,
                    callback_query: {
                        id: "valid-callback",
                        data: callbackData,
                        message: { chat: { id: "chat-123" }, message_id: 42 }
                    }
                }]
            }
        };
    };

    telegramApi.api.post = async (url, data) => {
        posts.push({ url, data });
        if (url === "/answerCallbackQuery" && data.callback_query_id === "stale-callback") {
            const error = new Error("Request failed with status code 400");
            error.response = { data: { ok: false, error_code: 400, description: "Bad Request" } };
            throw error;
        }
        return { data: { ok: true } };
    };

    await telegramApi.waitForPayslipDecision("chat-123");

    assert.equal(posts.some(({ url }) => url === "/sendDocument"), true);
    assert.equal(telegramApi.pendingPayslips.size, 0);
});

test("waitForPayslipDecision rejects an invalid Telegram response", async () => {
    const { telegramApi } = createTelegramApi();
    telegramApi.api.get = async () => ({ data: { ok: false, result: null } });

    await assert.rejects(
        telegramApi.waitForPayslipDecision("chat-123"),
        /Réponse inattendue de Telegram/
    );
});
