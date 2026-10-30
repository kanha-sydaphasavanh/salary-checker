import axios from "axios";
import { getDateTime } from "./utils.js";
import "dotenv/config";


export class TelegramApi {
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
}