import axios from "axios";
import { getDateTime } from "./utils.js";
import 'dotenv/config'; // Only for dev mode


export class IluccaApi {
    constructor() {
        this.now = new Date();
        this.AUTH_TOKEN = process.env.ILUCCA_AUTH_TOKEN;
        this.api = axios.create({
            baseURL: 'https://sivecogroup.ilucca.net/payslip/api/payslips',
            headers: {
                'Cookie': `_BEAMER_USER_ID_xWDIXXVd32349=${process.env.ILUCCA_BEAMER_USER_ID}; _BEAMER_FIRST_VISIT_xWDIXXVd32349=${this.now.toISOString()}; authToken=${this.AUTH_TOKEN}; _dd_s=rum=0`,
                'Content-Type': 'application/json'
            }
        });
    }

    async getPayslips() {
        try {
            const response = await this.api.get('/mine?limit=1000');
            return response.data;
        } catch (error) {
            console.error(`[${getDateTime}] - Error fetching payslips:`, error || error.message);
            throw error;
        }
    }

    async downloadPayslip(payload) {
        try {
            const response = await this.api.post(`/download`, payload, {
                responseType: 'stream'
            });
            return response;
        } catch (error) {
            console.error(`[${getDateTime()}] - Error downloading payslip:`, error || error.message);
            throw error;
        }
    }
}