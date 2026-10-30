import axios from "axios";
import { randomUUID } from "crypto";
import { getDateTime } from "./utils.js";
import "dotenv/config";


export class TelegramApi {
    pendingPayslips = new Map();

    constructor() {
        this.api = axios.create({
            baseURL: 'https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    async sendMessage(chatId, text) {
        try {
            const response = await this.api.post(`/sendMessage`, {
                chat_id: chatId,
                text: text
            });
            return response.data;
        } catch (error) {
            console.error(`[${getDateTime()}] - Error sending Telegram message:`, error || error.message);
            throw error;
        }
    }

    async sendPayslipPrompt(chatId, fileName, fileBuffer) {
        const requestId = randomUUID();
        this.pendingPayslips.set(requestId, { chatId, fileName, fileBuffer });

        try {
            const response = await this.api.post(`/sendMessage`, {
                chat_id: chatId,
                text: `Souhaites-tu la télécharger ?`,
                reply_markup: {
                    inline_keyboard: [[
                        { text: "Oui", callback_data: `payslip_yes:${requestId}` },
                        { text: "Non", callback_data: `payslip_no:${requestId}` }
                    ]]
                }
            });
            return response.data;
        } catch (error) {
            this.pendingPayslips.delete(requestId);
            console.error(`[${getDateTime()}] - Error sending Telegram payslip prompt:`, error || error.message);
            throw error;
        }
    }

    async waitForPayslipDecision(chatId) {
        let offset = 0;

        while (true) {
            const response = await this.api.get('/getUpdates', {
                params: {
                    offset,
                    timeout: 30,
                    allowed_updates: ['callback_query']
                },
                timeout: 35000
            });
            const updates = response.data.result;

            if (!response.data.ok || !Array.isArray(updates)) {
                throw new Error('Réponse inattendue de Telegram lors de la lecture des réponses.');
            }

            for (const update of updates) {
                offset = update.update_id + 1;
                const callback = update.callback_query;
                const callbackData = callback?.data;

                if (!callback || !/^payslip_(yes|no):/.test(callbackData || '')) {
                    continue;
                }

                const [, decision, requestId] = callbackData.match(/^payslip_(yes|no):(.+)$/);
                const payslip = this.pendingPayslips.get(requestId);

                if (!payslip || String(callback.message?.chat.id) !== String(chatId) || String(payslip.chatId) !== String(chatId)) {
                    try {
                        await this.api.post('/answerCallbackQuery', {
                            callback_query_id: callback.id,
                            text: "Cette demande n'est plus disponible."
                        });
                    } catch (error) {
                        console.warn(`[${getDateTime()}] - Callback Telegram périmé ou invalide ignoré pour ${chatId}:`, error?.response?.data || error.message || error);
                    }
                    continue;
                }

                try {
                    await this.api.post('/answerCallbackQuery', {
                        callback_query_id: callback.id,
                        text: decision === 'yes' ? 'Envoi du fichier…' : 'Téléchargement annulé.'
                    });
                } catch (error) {
                    console.warn(`[${getDateTime()}] - Impossible de confirmer le callback Telegram pour ${chatId}:`, error?.response?.data || error.message || error);
                }

                if (decision === 'yes') {
                    const formData = new FormData();
                    formData.append('chat_id', String(chatId));
                    formData.append('document', new Blob([payslip.fileBuffer], { type: 'application/pdf' }), payslip.fileName);
                    await this.api.post('/sendDocument', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                }

                await this.api.post('/editMessageText', {
                    chat_id: chatId,
                    message_id: callback.message.message_id,
                    text: decision === 'yes'
                        ? `Fichier envoyé : ${payslip.fileName}`
                        : `Téléchargement annulé : ${payslip.fileName}`,
                    reply_markup: { inline_keyboard: [] }
                });
                this.pendingPayslips.delete(requestId);
                return;
            }
        }
    }
}