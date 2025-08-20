import axios from "axios";
import { getDateTime } from "./utils.js";
import "dotenv/config";

export class DiscordBotApi {
    constructor() {
        this.api = axios.create({
            baseURL: 'https://discord.com/api/v10',
            headers: {
                'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'DiscordBot (https://discord.com/developers/docs/intro)'
            }
        });
    }

    async sendMessage(channelId, content) {
        try {
            const response = await this.api.post(`/channels/${channelId}/messages`, {
                content
            });
            return response.data;
        } catch (error) {
            console.error(`[${getDateTime()}] - Error sending Discord message:`, error || error.message);
            throw error;
        }
    }
}